import DeleteIcon from "../components/common/DeleteIcon";
import BulkDeleteModal from "../components/common/BulkDeleteModal";
import { exportRecordsToCSV } from "../utils/exportRecordsToCSV";
import PdfIcon from "../components/common/PdfIcon";
import VideoIcon from "../components/common/VideoIcon";
import Checkbox from "../components/common/Checkbox";
import PlusIcon from "../components/common/PlusIcon";
import MoreIcon from "../components/common/MoreIcon";
import HotlistIcon from "../components/common/HotlistIcon";
import DownloadIcon from "../components/common/DownloadIcon";
import React, { useEffect, useState, useMemo, useRef } from "react";
import TableSkeletonRows from "../components/common/TableSkeletonRows";
import { useTopLoadingSignal } from "../components/common/TopLoadingBar";
import Skeleton from "../components/common/Skeleton";
import { createPortal } from "react-dom";
import API from "../services/api";
import { Link } from "react-router-dom";
import logo from "/DataCircles.png";
import FilterIcon from "../components/common/FilterIcon";
import HighlightText from "../components/common/HighlightText";
import {
  X,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Building2,
  MapPin,
  Briefcase,
  Globe,
  CheckSquare,
  FolderPlus,
  StickyNote,
  SlidersHorizontal,
  EyeOff,
  Pin,
  PinOff,
  User, ArrowUp, ArrowDown, Database } from "lucide-react";
import StarIcon from "../components/common/StarIcon";
import ImportClients from "../components/company/ImportClients";
import Hotlist from "../components/company/Hotlist";
import BulkActions from "../components/BulkActions";
import QuickCompanyForm from "../components/company/QuickCompanyForm";
import ProfilePicture from "../components/contact/ProfilePicture";
import VideoTutorialModal from "../components/VideoTutorialModal";
import ColumnSettingsPanel from "../components/ColumnSettingsPanel";
import { useColumnSettings } from "../hooks/useColumnSettings";
import { useLocation } from "react-router-dom";
import toast from "react-hot-toast";

const CompanyNameIcon = (props) => (
  <svg width="16" height="15" viewBox="0 0 16 15" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M7.91667 10.2083C8.32153 10.2083 8.66583 10.0665 8.94958 9.78292C9.2332 9.49917 9.375 9.15486 9.375 8.75C9.375 8.34514 9.2332 8.00083 8.94958 7.71708C8.66583 7.43347 8.32153 7.29167 7.91667 7.29167C7.51181 7.29167 7.1675 7.43347 6.88375 7.71708C6.60014 8.00083 6.45833 8.34514 6.45833 8.75C6.45833 9.15486 6.60014 9.49917 6.88375 9.78292C7.1675 10.0665 7.51181 10.2083 7.91667 10.2083ZM1.50646 14.5833C1.08549 14.5833 0.729167 14.4375 0.4375 14.1458C0.145833 13.8542 0 13.4978 0 13.0769V4.42313C0 4.00215 0.145833 3.64583 0.4375 3.35417C0.729167 3.0625 1.08549 2.91667 1.50646 2.91667H5V1.50646C5 1.08549 5.14583 0.729167 5.4375 0.4375C5.72917 0.145833 6.08549 0 6.50646 0H9.32687C9.74785 0 10.1042 0.145833 10.3958 0.4375C10.6875 0.729167 10.8333 1.08549 10.8333 1.50646V2.91667H14.3269C14.7478 2.91667 15.1042 3.0625 15.3958 3.35417C15.6875 3.64583 15.8333 4.00215 15.8333 4.42313V13.0769C15.8333 13.4978 15.6875 13.8542 15.3958 14.1458C15.1042 14.4375 14.7478 14.5833 14.3269 14.5833H1.50646ZM1.50646 13.3333H14.3269C14.391 13.3333 14.4498 13.3066 14.5031 13.2531C14.5566 13.1998 14.5833 13.141 14.5833 13.0769V4.42313C14.5833 4.35896 14.5566 4.30021 14.5031 4.24687C14.4498 4.1934 14.391 4.16667 14.3269 4.16667H1.50646C1.44229 4.16667 1.38354 4.1934 1.33021 4.24687C1.27674 4.30021 1.25 4.35896 1.25 4.42313V13.0769C1.25 13.141 1.27674 13.1998 1.33021 13.2531C1.38354 13.3066 1.44229 13.3333 1.50646 13.3333ZM6.25 2.91667H9.58333V1.50646C9.58333 1.44229 9.5566 1.38354 9.50313 1.33021C9.44979 1.27674 9.39104 1.25 9.32687 1.25H6.50646C6.44229 1.25 6.38354 1.27674 6.33021 1.33021C6.27674 1.38354 6.25 1.44229 6.25 1.50646V2.91667Z" fill="#525252" />
  </svg>
);

const CompanyIndustryIcon = (props) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M0 15.5127V6.18896L5 4.0625V5.71312L9.16667 4.04646V6.34604H15.8333V15.5127H0ZM1.25 14.2627H14.5833V7.59604H7.91667V5.88771L3.75 7.55437V5.92937L1.25 7.03354V14.2627ZM7.17958 12.4038H8.65375V9.455H7.17958V12.4038ZM3.84625 12.4038H5.32042V9.455H3.84625V12.4038ZM10.5129 12.4038H11.9871V9.455H10.5129V12.4038ZM15.8333 6.34604H12.4519L13.2852 0H15.0481L15.8333 6.34604Z" fill="#525252" />
  </svg>
);

const CompanyLocationIcon = (props) => (
  <svg width="11" height="16" viewBox="0 0 11 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M1.96479 15.2275C1.0716 14.8237 0.625 14.3019 0.625 13.6619C0.625 13.3659 0.736389 13.0876 0.959167 12.8269C1.18194 12.5662 1.48993 12.3424 1.88313 12.1554L2.86708 13.0481C2.68861 13.1197 2.50104 13.2088 2.30437 13.3156C2.10785 13.4226 1.97326 13.5353 1.90063 13.6538C2.0384 13.9028 2.4484 14.1199 3.13062 14.3052C3.81271 14.4906 4.57472 14.5833 5.41667 14.5833C6.25319 14.5833 7.01604 14.4906 7.70521 14.3052C8.39424 14.1199 8.80771 13.9028 8.94563 13.6538C8.87507 13.5267 8.73271 13.4097 8.51854 13.3029C8.30424 13.1961 8.10097 13.1069 7.90875 13.0352L8.87979 12.1298C9.30604 12.3253 9.63403 12.5535 9.86375 12.8142C10.0935 13.0749 10.2083 13.3574 10.2083 13.6619C10.2083 14.3019 9.76174 14.8237 8.86854 15.2275C7.97535 15.6314 6.82472 15.8333 5.41667 15.8333C4.00861 15.8333 2.85799 15.6314 1.96479 15.2275ZM5.4375 11.7708C6.81778 10.7249 7.85382 9.68882 8.54562 8.66271C9.23743 7.63646 9.58333 6.6175 9.58333 5.60583C9.58333 4.16778 9.13326 3.08229 8.23312 2.34938C7.33299 1.61646 6.39417 1.25 5.41667 1.25C4.44444 1.25 3.50694 1.61646 2.60417 2.34938C1.70139 3.08229 1.25 4.16778 1.25 5.60583C1.25 6.55236 1.5916 7.53313 2.27479 8.54813C2.95799 9.56313 4.01222 10.6374 5.4375 11.7708ZM5.41667 13.3333C3.59722 11.9743 2.23958 10.6543 1.34375 9.37333C0.447917 8.09236 0 6.83653 0 5.60583C0 4.67847 0.16375 3.86597 0.49125 3.16833C0.81875 2.47069 1.24153 1.88653 1.75958 1.41583C2.27778 0.945278 2.85875 0.591666 3.5025 0.355C4.14611 0.118333 4.78417 0 5.41667 0C6.04917 0 6.68722 0.118333 7.33083 0.355C7.97458 0.591666 8.55556 0.945278 9.07375 1.41583C9.59181 1.88653 10.0146 2.47069 10.3421 3.16833C10.6696 3.86597 10.8333 4.67847 10.8333 5.60583C10.8333 6.83653 10.3854 8.09236 9.48958 9.37333C8.59375 10.6543 7.23611 11.9743 5.41667 13.3333ZM5.41667 6.99521C5.83222 6.99521 6.18715 6.84938 6.48146 6.55771C6.7759 6.26604 6.92312 5.90972 6.92312 5.48875C6.92312 5.07319 6.7759 4.71826 6.48146 4.42396C6.18715 4.12951 5.83222 3.98229 5.41667 3.98229C5.00639 3.98229 4.65278 4.12951 4.35583 4.42396C4.05875 4.71826 3.91021 5.07319 3.91021 5.48875C3.91021 5.90972 4.05875 6.26604 4.35583 6.55771C4.65278 6.84938 5.00639 6.99521 5.41667 6.99521Z" fill="#525252" />
  </svg>
);

const CompanyWebsiteIcon = (props) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M15.6667 15.9166L12.9999 13.2499V15.4166H11.7499V11.1249H15.9999V12.3749H13.8332L16.5 15.0416L15.6667 15.9166ZM8 15.6666C6.90556 15.6666 5.87639 15.4588 4.9125 15.0433C3.94861 14.6277 3.11111 14.0637 2.39861 13.3514C1.68639 12.639 1.12222 11.8014 0.706944 10.8383C0.291389 9.87528 0.0833333 8.84618 0.0833333 7.75139C0.0833333 6.65639 0.291389 5.62709 0.706944 4.66375C1.12222 3.70022 1.68639 2.86209 2.39861 2.14958C3.11111 1.43695 3.94861 0.872569 4.9125 0.456805C5.87556 0.041144 6.90444 -0.166672 8 -0.166672C9.09444 -0.166672 10.1236 0.041144 11.0875 0.456805C12.0514 0.872256 12.8889 1.43626 13.6014 2.14875C14.3136 2.86125 14.8778 3.69907 15.2931 4.66222C15.7086 5.62542 15.9167 6.65459 15.9167 7.74972C15.9167 7.99976 15.9047 8.25085 15.8806 8.50305C15.8567 8.75417 15.8222 9.00528 15.7736 9.25639H14.4903C14.5486 9.00528 14.5931 8.75417 14.6222 8.50305C14.6522 8.25207 14.6667 7.99976 14.6667 7.74972C14.6667 7.44695 14.6467 7.14417 14.6069 6.84167C14.5667 6.53889 14.5042 6.23792 14.4181 5.93889H11.3208C11.3736 6.23792 11.4111 6.53889 11.4347 6.84167C11.4583 7.14417 11.4694 7.44695 11.4694 7.74972C11.4694 7.99976 11.4611 8.25085 11.4444 8.50305C11.4272 8.75417 11.4028 9.00528 11.3694 9.25639H10.1194C10.1522 9.00528 10.1778 8.75417 10.1944 8.50305C10.2111 8.25207 10.2194 7.99976 10.2194 7.74972C10.2194 7.44695 10.2078 7.14417 10.1847 6.84167C10.1611 6.53889 10.1236 6.23792 10.0708 5.93889H5.92917C5.87694 6.23792 5.83889 6.53903 5.81583 6.84222C5.79194 7.14542 5.78 7.44861 5.78 7.75181C5.78 8.05499 5.79194 8.35735 5.81583 8.65916C5.83889 8.96097 5.87694 9.26153 5.92917 9.56083H8.99444V10.8108H6.21639C6.40139 11.4663 6.63944 12.0954 6.93167 12.6977C7.22389 13.2999 7.58 13.867 8 14.3989C8.25139 14.3989 8.50194 14.3842 8.75167 14.3549C9.00167 14.3255 9.25222 14.297 9.50333 14.2691V15.5368C9.25222 15.5646 9.00167 15.5931 8.75167 15.6224C8.50194 15.6519 8.25139 15.6666 8 15.6666ZM1.58194 9.56083H4.68C4.62778 9.26153 4.58972 8.96056 4.56583 8.65792C4.54194 8.35513 4.53 8.05194 4.53 7.74833C4.53 7.44528 4.54194 7.14264 4.56583 6.84042C4.58972 6.53792 4.62778 6.23792 4.68 5.93889H1.58194C1.49583 6.23792 1.43333 6.53903 1.39333 6.84222C1.35306 7.14542 1.33306 7.44861 1.33306 7.75181C1.33306 8.05499 1.35306 8.35735 1.39333 8.65916C1.43333 8.96097 1.49583 9.26153 1.58194 9.56083ZM2.10583 4.6889H4.92917C5.07222 4.08417 5.26333 3.49917 5.50278 2.9339C5.74222 2.36862 6.03722 1.82848 6.38667 1.31347C5.45111 1.52068 4.6125 1.91917 3.87028 2.5089C3.12806 3.09862 2.54083 3.82514 2.10583 4.6889ZM6.38667 14.19C6.05167 13.6668 5.76278 13.1213 5.52 12.5535C5.27722 11.9857 5.08083 11.4022 4.93083 10.8031H2.10583C2.54083 11.6609 3.13028 12.3823 3.87417 12.9672C4.61806 13.5522 5.45722 13.9531 6.38667 14.19ZM6.21639 4.6889H9.78028C9.60528 4.03292 9.36722 3.40667 9.06611 2.81014C8.765 2.21361 8.41722 1.64361 8.02278 1.10014C7.6075 1.63194 7.25139 2.19889 6.95444 2.8010C6.65722 3.40292 6.40972 4.03181 6.21639 4.6889ZM11.0708 4.6889H13.8942C13.4592 3.82264 12.8708 3.09472 12.1289 2.50236C11.3867 1.90972 10.5481 1.51264 9.61306 1.31111C9.94806 1.83128 10.2389 2.36917 10.4856 2.9248C10.7325 3.48042 10.9306 4.06153 11.0708 4.6889Z" fill="#525252" />
  </svg>
);

const CompanyGSTINIcon = (props) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M3.125 11.0417H8.541V9.7917H3.125V11.0417ZM3.125 7.7083H10.958V6.4583H3.125V7.7083ZM3.125 4.375H10.958V3.125H3.125V4.375ZM1.506 14.1667C1.085 14.1667 0.729 14.0209 0.4375 13.7292C0.14583 13.4375 0 13.0812 0 12.6603V1.50638C0 1.08543 0.14583 0.72913 0.4375 0.4375C0.729 0.14583 1.085 0 1.506 0H12.66C13.081 0 13.4373 0.14583 13.729 0.4375C14.0207 0.72913 14.1667 1.08543 14.1667 1.50638V12.6603C14.1667 13.0812 14.0207 13.4375 13.729 13.7292C13.4373 14.0209 13.081 14.1667 12.66 14.1667H1.506ZM1.506 12.9167H12.66C12.7241 12.9167 12.7829 12.89 12.8363 12.8365C12.8896 12.7832 12.9163 12.7244 12.9163 12.6603V1.50638C12.9163 1.44221 12.8896 1.38346 12.8363 1.33013C12.7829 1.27665 12.7241 1.24992 12.66 1.24992H1.506C1.44183 1.24992 1.38308 1.27665 1.32975 1.33013C1.27625 1.38346 1.2495 1.44221 1.2495 1.50638V12.6603C1.2495 12.7244 1.27625 12.7832 1.32975 12.8365C1.38308 12.89 1.44183 12.9167 1.506 12.9167Z" fill="#1C1B1F" />
  </svg>
);

const CompanyDocumentSignedIcon = (props) => (
  <svg width="13" height="16" viewBox="0 0 13 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M2.87021 11.7227L1.16188 4.6875L6.25 0L11.33 4.6875L9.62187 11.7227H2.87021ZM3.85417 10.4727H8.63792L9.94063 5.11375L6.875 2.28042V4.98562C7.05875 5.09785 7.20618 5.24604 7.31729 5.43021C7.4284 5.61451 7.48396 5.82097 7.48396 6.04958C7.48396 6.38833 7.36299 6.67868 7.12104 6.92063C6.87896 7.16257 6.58861 7.28354 6.25 7.28354C5.90597 7.28354 5.61299 7.16257 5.37104 6.92063C5.1291 6.67868 5.00813 6.38833 5.00813 6.04958C5.00813 5.82097 5.06368 5.61319 5.17479 5.42625C5.2859 5.23931 5.43597 5.09243 5.625 4.98562V2.28042L2.55938 5.11375L3.85417 10.4727ZM0 15.8333L0.42625 14.6073C0.526667 14.3081 0.701389 14.0691 0.950417 13.8902C1.19931 13.7113 1.48028 13.6219 1.79333 13.6219H10.7067C11.0197 13.6219 11.3007 13.7113 11.5496 13.8902C11.7986 14.0691 11.9733 14.3081 12.0737 14.6073L12.5 15.8333H0Z" fill="#525252" />
  </svg>
);

const CompanyLeadSourceIcon = CompanyDocumentSignedIcon;
import { getVideoTutorial } from "../utils/videoTutorials";
import { getPinnedBoundaryOverlayStyle } from "../utils/pinnedColumnShadow";
import { useSubscription } from "../contexts/SubscriptionContext";
import { hasMinPlan } from "../utils/subscriptionHelpers";
import UpgradeRequiredModal from "../components/subscription/UpgradeRequiredModal";
import AdvancedFilterPanel from "../components/common/AdvancedFilterPanel";
import useCompanyStore from "../store/useCompanyStore";
import AddToCompanyHotlistModal from "../components/company/AddToCompanyHotlistModal";
import ExportModal from "../components/common/ExportModal";
import { NoteEditor } from "../components/company/NoteSection";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import CompanyQuickView from "../components/company/CompanyQuickView";
import AppToaster from "../components/AppToaster";

import SearchIcon from "../components/common/SearchIcon";
import SettingsIcon from "../components/common/SettingsIcon";
import useSearchOverlayOpen from "../hooks/useSearchOverlayOpen";
import UploadIcon from "../components/common/UploadIcon";
import EyeIcon from "../components/common/EyeIcon";
import EditIcon from "../components/common/EditIcon";
// The app is rendered inside #root which carries a CSS `zoom` (0.75 on desktop).
// getBoundingClientRect() returns UNSCALED layout coordinates, while portal overlays
// mounted on document.body render in visual (un-zoomed) space and mouse clientX/Y are
// visual too. So any rect-derived position/size fed to a body-portal must be multiplied
// by this zoom factor to line up on screen.
const getRootZoom = () => {
  if (typeof window === "undefined") return 1;
  const z = parseFloat(getComputedStyle(document.documentElement).zoom);
  return z && !Number.isNaN(z) ? z : 1;
};

// Effective zoom applied to an element's ancestor chain. Used to correct
// coordinates SET on a document.body portal (the drag-ghost), which is painted
// inside the dynamic <html> zoom, back into the visual space of clientX/getBoundingClientRect.
const getAncestorZoom = (el) => {
  let z = 1;
  let node = el;
  while (node && node.nodeType === 1) {
    const cz = parseFloat(getComputedStyle(node).zoom);
    if (cz && !Number.isNaN(cz)) z *= cz;
    node = node.parentElement;
  }
  return z || 1;
};

function Companies() {
  const isSearchOverlayOpen = useSearchOverlayOpen();
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState({
    name: "",
    industry: "",
    address: "",
    website: "",
    gstin: "",
    leadSource: "",
    profilePicture: null,
    profilePictureUrl: "",
  });
  const [additionalFields, setAdditionalFields] = useState({});
  const [companyFieldNames, setCompanyFieldNames] = useState([]);
  const [loading, setLoading] = useState(true);
  // Toolbar/search-bar skeleton only for the very first load. Once the page
  // has loaded once, a search/filter that narrows results to zero must NOT
  // re-skeleton the toolbar — that unmounted the search input mid-typing and
  // read as the whole page reloading on every keystroke.
  const hasLoadedOnceRef = useRef(false);
  const showLoadingSkeleton =
    loading && companies.length === 0 && !hasLoadedOnceRef.current;
  // Signal the top progress bar on EVERY fetch, not just the skeleton case.
  // Paging is server-side here, so page 2 -> 3 has a real network round trip;
  // the thin top bar is what communicates that now, instead of dimming the
  // whole table (see the table container below).
  useTopLoadingSignal(loading);
  const [industries, setIndustries] = useState([]);
  const [industriesLoading, setIndustriesLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [editCompany, setEditCompany] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showHotlist, setShowHotlist] = useState(false);
  const [permission, setPermission] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAddToHotlistModal, setShowAddToHotlistModal] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef(null);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchInputRef = useRef(null);
  const [openRowActionsId, setOpenRowActionsId] = useState(null);
  const [rowActionsPos, setRowActionsPos] = useState(null);
  const rowActionsRef = useRef(null);
  const [editingPage, setEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState("");
  const [openColumnMenuKey, setOpenColumnMenuKey] = useState(null);
  const [columnMenuPos, setColumnMenuPos] = useState(null);
  const columnMenuRef = useRef(null);
  const tableScrollRef = useRef(null);
  const [quickHotlistCompanyId, setQuickHotlistCompanyId] = useState(null);
  const [ownerPickerCompanyId, setOwnerPickerCompanyId] = useState(null);
  const [ownerPickerSearch, setOwnerPickerSearch] = useState("");
  const [ownerPickerSaving, setOwnerPickerSaving] = useState(false);
  const [orgUsers, setOrgUsers] = useState([]);
  const [orgUsersLoaded, setOrgUsersLoaded] = useState(false);

  // Starring is per-user and persisted server-side (not localStorage) so the
  // paginated API can sort starred companies to the top of page 1 regardless
  // of which page they were starred from.
  const toggleStar = async (e, companyId) => {
    e.stopPropagation();
    try {
      await API.post(`/companies/${companyId}/star`);
      // Starred items move to the top of page 1 server-side, so jump there
      // and refetch rather than trying to reorder the current page locally.
      if (pagination.currentPage === 1) {
        fetchCompanies();
      } else {
        setPagination((prev) => ({ ...prev, currentPage: 1 }));
      }
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to update star");
    }
  };
  const location = useLocation();
  const { state } = location;

  // "View all" from the global search panel hands its query off via
  // `?search=` rather than trying to replicate the search itself — this
  // drops it straight into the table's own search box on arrival (open, not
  // just filled in), so the list is already filtered instead of showing
  // everything.
  //
  // Captured once, synchronously, rather than read inside the effect below:
  // the mount-time fetch effect (a few hundred lines down) needs to know
  // *before its first run* whether a search is coming, so it can skip firing
  // its own empty-search request. Without that guard, two fetches land
  // almost together — one for "" (every company) and one for the real query
  // — and there's nothing to stop the empty one's response, since it's
  // fetching the whole table and is inherently slower, from arriving second
  // and clobbering the correctly-filtered result on screen.
  const initialSearchFromUrl = useRef(
    new URLSearchParams(location.search).get("search")
  ).current;
  useEffect(() => {
    if (initialSearchFromUrl) {
      setSearchTerm(initialSearchFromUrl);
      setIsSearchExpanded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [showBulkNoteModal, setShowBulkNoteModal] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [taggedContacts, setTaggedContacts] = useState([]);
  const [allContacts, setAllContacts] = useState([]); // Needed for the tagging dropdown

  // Video Tutorial State
  const [showVideoTutorial, setShowVideoTutorial] = useState(false);

  // Column Settings State
  const [showColumnSettings, setShowColumnSettings] = useState(false);

  const [quickViewCompanyId, setQuickViewCompanyId] = useState(null);

  // Advanced Filter state
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Bulk selection
  const [selectedCompanies, setSelectedCompanies] = useState([]);
  // O(1) membership checks instead of .includes() array scans repeated per row.
  const selectedCompaniesSet = useMemo(() => new Set(selectedCompanies), [selectedCompanies]);
  // Bulk row selection requires Growth+
  const { subscription } = useSubscription();
  const hasBulkAccess = hasMinPlan(subscription?.subscription?.planName, "growth");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  // Selection mode state
  const [selectionMode, setSelectionMode] = useState(true);
  const [longPressTimer, setLongPressTimer] = useState(null);

  // Delays the bulk-strip's unmount so it can play a slide-out-right exit
  // animation on deselect (mirroring the slide-in-right entrance).
  const [showBulkStrip, setShowBulkStrip] = useState(false);
  const [bulkStripClosing, setBulkStripClosing] = useState(false);
  useEffect(() => {
    const active = selectionMode && selectedCompanies.length > 0;
    if (active) {
      setBulkStripClosing(false);
      setShowBulkStrip(true);
    } else if (showBulkStrip) {
      setBulkStripClosing(true);
      const t = setTimeout(() => {
        setShowBulkStrip(false);
        setBulkStripClosing(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [selectionMode, selectedCompanies.length]);

  const [columnSizing, setColumnSizing] = useState({});

  const [pinnedColumns, setPinnedColumns] = useState([]); // [{ key, side: 'left' | 'right' }]

  const pinColumnToSide = (colKey, side) => {
    setPinnedColumns((prev) => [...prev.filter((p) => p.key !== colKey), { key: colKey, side }]);
  };

  const unpinColumn = (colKey) => {
    setPinnedColumns((prev) => prev.filter((p) => p.key !== colKey));
  };

  const getColumnPinSide = (colKey) => pinnedColumns.find((p) => p.key === colKey)?.side || null;

  const {
    searchTerm,
    setSearchTerm,
    filterIndustry,
    setFilterIndustry,
    activeFilters,
    setActiveFilters,
    pagination,
    setPagination,
    sortConfig,
    setSortConfig,
    setCurrentCompanyIds,
  } = useCompanyStore();

  // Define default columns - NOW UPDATES WHEN companyFieldNames CHANGES
  const defaultColumns = useMemo(() => {
    const baseColumns = [
      {
        key: "name",
        label: "Company Name",
        visible: true,
        order: 0,
        required: true,
        defaultVisible: true,
        sortable: true,
        icon: CompanyNameIcon,
      },
      {
        key: "industry",
        label: "Industry",
        visible: true,
        order: 1,
        sortable: true,
        icon: CompanyIndustryIcon,
      },
      {
        key: "address",
        label: "Location",
        visible: true,
        order: 2,
        icon: CompanyLocationIcon,
      },
      {
        key: "website",
        label: "Website",
        visible: true,
        order: 3,
        icon: CompanyWebsiteIcon,
      },
      {
        key: "gstin",
        label: "GSTIN",
        visible: true,
        order: 4,
        sortable: true,
        icon: CompanyGSTINIcon,
      },
      {
        key: "leadSource",
        label: "Lead Source",
        visible: true,
        order: 6,
        sortable: true,
        icon: CompanyLeadSourceIcon,
      },
    ];

    // Add custom fields ONLY if they exist
    if (companyFieldNames && companyFieldNames.length > 0) {
      const customColumns = companyFieldNames.map((field, index) => ({
        key: field.name || field,
        label: field.name || field,
        visible: false, // Hidden by default - user can show them
        order: baseColumns.length + index,
        isCustomField: true,
        type: field.type || "text",
        options: field.options,
        description: `Custom field: ${field.name || field}`,
      }));

      return [...baseColumns, ...customColumns];
    }

    return baseColumns;
  }, [companyFieldNames]); // Re-run when companyFieldNames changes

  // Use column settings hook
  const { columns, saveColumns, getVisibleColumns } = useColumnSettings(
    "companies",
    defaultColumns,
  );

  const visibleColumns = useMemo(() => getVisibleColumns(), [columns]);

  const [draggedColKey, setDraggedColKey] = useState(null);
  const [dragOverColKey, setDragOverColKey] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  const dragOverRef = useRef(null);
  const ghostElRef = useRef(null);

  const startColumnDrag = (e, colId) => {
    if (e.button !== 0) return;
    if (e.target.closest("button") || e.target.closest("[data-resize-handle]")) return;

    // REMOVED: an `if (e.detail === 1) { …open the column menu… return; }` block.
    // It was broken three ways at once. (1) It referenced openColMenuKey /
    // setOpenColMenuKey / setColMenuPos, which don't exist in this file — the
    // state here is openColumnMenuKey / setColumnMenuPos — so it threw a
    // ReferenceError on every header mousedown. (2) Because it threw (and
    // because it `return`ed early), the movement-threshold drag logic below
    // never got its mousemove/mouseup listeners attached, so column reordering
    // could not start. (3) Its position maths was unzoomed and duplicated the
    // chevron button's own correct, zoom-corrected calculation. The menu opens
    // solely from that button; a plain click on the header now does nothing.

    const th = e.currentTarget;
    const startX = e.clientX;
    const startY = e.clientY;
    const DRAG_THRESHOLD = 5;

    // Tracks whether the pointer has moved past the threshold yet. A plain click
    // (mousedown -> tiny/no movement -> mouseup) never crosses it, so it never shows
    // the drag ghost or touches drag state — only a deliberate drag does.
    const dragState = { started: false, offsetX: 0, offsetY: 0, zGhost: 1 };

    const positionGhost = (clientX, clientY) => {
      const el = ghostElRef.current;
      if (!el) return;
      const visualTop = clientY - dragState.offsetY;
      const visualLeft = clientX - dragState.offsetX;
      el.style.top = `${visualTop / dragState.zGhost}px`;
      el.style.left = `${visualLeft / dragState.zGhost}px`;
      el.style.maxHeight = `${Math.max(100, window.innerHeight - visualTop - 72) / dragState.zGhost}px`;
    };

    const updateDragOver = (clientX, clientY) => {
      const elAtPoint = document.elementFromPoint(clientX, clientY);
      const thAtPoint = elAtPoint?.closest("th[data-col-id]");
      const overKey = thAtPoint?.getAttribute("data-col-id") || null;
      if (dragOverRef.current !== overKey) {
        dragOverRef.current = overKey;
        setDragOverColKey(overKey);
      }
    };

    const beginDrag = () => {
      dragState.started = true;
      window.getSelection?.()?.removeAllRanges();

      const rect = th.getBoundingClientRect();
      const label = visibleColumns.find((vc) => vc.key === colId)?.label || colId;
      const previewRows = (sortedCompanies || [])
        .map((c) => String(getFieldValue(c, colId) ?? "").trim() || "—");
      // Grab offset is measured in visual space (rect + clientX both visual) — no
      // correction. `zGhost` scales the values we SET on the body-portal ghost so
      // they map back to visual space (the ghost is painted inside the <html> zoom).
      dragState.zGhost = getAncestorZoom(document.body);
      dragState.offsetX = startX - rect.left;
      dragState.offsetY = startY - rect.top;

      dragOverRef.current = null;
      setDraggedColKey(colId);
      setDragOverColKey(null);
      document.body.style.userSelect = "none";
      // Only the label/previewRows/dimensions go through React state (set once).
      // x/y position is mutated directly on the DOM node below so mousemove never
      // triggers a re-render of the whole (up to 500-row) table.
      setDragGhost({
        label,
        previewRows,
        offsetX: dragState.offsetX,
        offsetY: dragState.offsetY,
        width: rect.width / dragState.zGhost,
        height: rect.height / dragState.zGhost,
      });

      // Position immediately so the ghost doesn't flash at (0,0) before the first mousemove.
      requestAnimationFrame(() => positionGhost(startX, startY));
    };

    const handleMouseMove = (moveEvent) => {
      if (!dragState.started) {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        e.preventDefault();
        beginDrag();
      }
      positionGhost(moveEvent.clientX, moveEvent.clientY);
      updateDragOver(moveEvent.clientX, moveEvent.clientY);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      if (!dragState.started) return;
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
    const sorted = [...columns].sort((a, b) => a.order - b.order);
    const visibleSorted = sorted.filter((c) => c.visible);
    const draggedIdx = visibleSorted.findIndex((c) => c.key === draggedKey);
    const targetIdx = visibleSorted.findIndex((c) => c.key === targetKey);
    if (draggedIdx === -1 || targetIdx === -1) return;

    const reorderedVisible = [...visibleSorted];
    const [moved] = reorderedVisible.splice(draggedIdx, 1);
    reorderedVisible.splice(targetIdx, 0, moved);

    let visibleCursor = 0;
    const newColumns = sorted
      .map((c) => (c.visible ? reorderedVisible[visibleCursor++] : c))
      .map((c, idx) => ({ ...c, order: idx }));

    saveColumns(newColumns);
  };

  const columnHelper = createColumnHelper();

  // Starred-first ordering now happens server-side (see fetchCompanies /
  // toggleStar), so `companies` already arrives in the right order.
  const sortedCompanies = companies;

  const renderRowActionsMenu = (company) => {
    const isOpen = openRowActionsId === company._id;
    return (
      <div
        className="relative flex-shrink-0"
        ref={isOpen ? rowActionsRef : null}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isOpen) {
              setOpenRowActionsId(null);
              setRowActionsPos(null);
              return;
            }
            // Same zoom-corrected, viewport-flipping/clamping position used for
            // the Deals row-actions menu: anchor to the button's own rect,
            // divide by ancestor zoom (the menu portals to document.body,
            // which paints inside this app's dynamic <html> zoom), flip
            // upward when there isn't room below, and clamp on both axes.
            const zMenu = getAncestorZoom(document.body);
            const MENU_W = 160;
            const MARGIN = 8;
            // 6 items (View Company, Add to Hotlist, Star/Unstar,
            // Set/Change Owner, Delete) + one divider + container padding.
            const MENU_H = 214;

            const rect = e.currentTarget.getBoundingClientRect();
            const viewportH = window.innerHeight / zMenu;
            const viewportW = window.innerWidth / zMenu;
            const top = rect.bottom / zMenu + 4;
            const bottomAnchor = rect.top / zMenu - 4;

            const openUp = viewportH - top < MENU_H + MARGIN;
            let calcTop = openUp ? bottomAnchor - MENU_H : top;
            calcTop = Math.max(MARGIN, Math.min(calcTop, viewportH - MENU_H - MARGIN));

            let calcLeft = rect.right / zMenu - MENU_W;
            calcLeft = Math.min(calcLeft, viewportW - MENU_W - MARGIN);
            calcLeft = Math.max(calcLeft, MARGIN);

            setRowActionsPos({ top: calcTop, left: calcLeft });
            setOpenRowActionsId(company._id);
            setIsMoreMenuOpen(false);
          }}
          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
          title="More actions"
        >
          <MoreIcon className="w-4 h-4" />
        </button>
        {isOpen && rowActionsPos && createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998]"
              onClick={() => { setOpenRowActionsId(null); setRowActionsPos(null); }}
            />
            <div
              style={{ position: "fixed", top: rowActionsPos.top, left: rowActionsPos.left }}
              className="w-[160px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right"
            >
              <Link
                to={`/companies/${company._id}`}
                state={{ companyIds: sortedCompanies.map((c) => c._id) }}
                onClick={() => { setOpenRowActionsId(null); setRowActionsPos(null); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
              >
                <EyeIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                View Company
              </Link>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenRowActionsId(null);
                  setRowActionsPos(null);
                  handleEdit(company);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
              >
                <EditIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                Edit
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenRowActionsId(null);
                  setRowActionsPos(null);
                  setQuickHotlistCompanyId(company._id);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
              >
                <PdfIcon className="w-4 h-4 text-[#1C1B1F]" />
                Add to Hotlist
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleStar(e, company._id);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
              >
                <StarIcon className={`w-3.5 h-3.5 ${company.isStarred ? "text-yellow-400 fill-yellow-400" : "text-[#1C1B1F]"}`} />
                {company.isStarred ? "Unstar Company" : "Star Company"}
              </button>
              {isAdmin && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenRowActionsId(null);
                    setRowActionsPos(null);
                    setOwnerPickerSearch("");
                    setOwnerPickerCompanyId(company._id);
                    if (!orgUsersLoaded) {
                      API.get("/auth/all-user-admin")
                        .then((res) => {
                          setOrgUsers(res.data?.allUsers || []);
                          setOrgUsersLoaded(true);
                        })
                        .catch(() => toast.error("Failed to load users"));
                    }
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                >
                  <User className="w-3.5 h-3.5 text-[#1C1B1F]" />
                  {company.owner ? "Change Owner" : "Set Owner"}
                </button>
              )}
              <div className="w-full border-t border-[#F1F1F5] my-0.5" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenRowActionsId(null);
                  setRowActionsPos(null);
                  handleDelete(company._id);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#CD3636] hover:bg-red-50 whitespace-nowrap"
              >
                <DeleteIcon className="w-3.5 h-3.5 text-[#CD3636]" />
                Delete
              </button>
            </div>
          </>,
          document.body,
        )}
      </div>
    );
  };

  const tableColumns = useMemo(() => {
    const cols = [];

    // 1. Checkbox Column
    if (selectionMode) {
      cols.push(
        columnHelper.display({
          id: "selection",
          size: 60,
          enableResizing: false,
          header: () => (
            <div className="flex justify-center items-center w-full">
              <Checkbox checked={
                  selectedCompanies.length === companies.length &&
                  companies.length > 0
                } onChange={handleSelectAll} uncheckedColor="text-[#525866]" />
            </div>
          ),
          cell: ({ row }) => (
            <div className="flex justify-center items-center gap-1 w-full">
              <Checkbox checked={selectedCompaniesSet.has(row.original._id)} onChange={() => handleSelectCompany(row.original._id)} />
            </div>
          ),
        }),
      );
    }


    // 2. Dynamic Data Columns
    // visibleColumns is already sorted by `order` (see getVisibleColumns), so filtering
    // preserves that sequencing within each group — dragging a header updates `order`,
    // pin side just decides which sticky group (left/none/right) a column belongs to.
    const leftPinnedKeys = pinnedColumns.filter((p) => p.side === "left").map((p) => p.key);
    const rightPinnedKeys = pinnedColumns.filter((p) => p.side === "right").map((p) => p.key);
    const leftPinnedFields = visibleColumns.filter((vc) => leftPinnedKeys.includes(vc.key));
    const rightPinnedFields = visibleColumns.filter((vc) => rightPinnedKeys.includes(vc.key));
    const unpinnedFields = visibleColumns.filter(
      (vc) => !leftPinnedKeys.includes(vc.key) && !rightPinnedKeys.includes(vc.key),
    );

    const orderedFields = [...leftPinnedFields, ...unpinnedFields, ...rightPinnedFields];
    const lastColumnKey = orderedFields[orderedFields.length - 1]?.key;

    orderedFields.forEach((vc) => {
      cols.push(
        columnHelper.accessor((row) => getFieldValue(row, vc.key), {
          id: vc.key,
          size: vc.key === "name" ? 220 : vc.key === "address" ? 250 : 150,
          header: () => {
            const isSortable = vc.sortable !== false;
            const pinSide = getColumnPinSide(vc.key);
            const isMenuOpen = openColumnMenuKey === vc.key;

            return (
              <div className="flex items-center justify-between w-full group">
                <span className="truncate flex-1 min-w-0 flex items-center gap-1.5" title={vc.label}>
                  <span className="truncate">{vc.label}</span>
                  {sortConfig.key === vc.key && (sortConfig.direction === "asc"
                    ? <ArrowUp className="w-3 h-3 text-[#0085FF] flex-shrink-0" />
                    : <ArrowDown className="w-3 h-3 text-[#0085FF] flex-shrink-0" />)}
                  {pinSide && (
                    <Pin
                      size={12}
                      className="text-blue-500 fill-blue-500 flex-shrink-0"
                      style={{ transform: "rotate(45deg)" }}
                    />
                  )}
                </span>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isMenuOpen) {
                      setOpenColumnMenuKey(null);
                      setColumnMenuPos(null);
                      return;
                    }
                    // rect + boundsRight are VISUAL px; the menu is portaled into
                    // document.body, which paints inside the dynamic <html> zoom, so
                    // every rect-derived value we set must be divided by that zoom
                    // (same correction as the drag-ghost above). Without it the menu
                    // drifts right by rect.right * (zoom - 1) — worst on the last columns.
                    const zMenu = getAncestorZoom(document.body);
                    const MENU_W = 160;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const boundsRight = tableScrollRef.current?.getBoundingClientRect().right ?? window.innerWidth;
                    let calcLeft = rect.right / zMenu - MENU_W;
                    calcLeft = Math.min(calcLeft, boundsRight / zMenu - MENU_W - 8);
                    calcLeft = Math.max(calcLeft, 8);
                    setColumnMenuPos({ top: rect.bottom / zMenu + 4, left: calcLeft });
                    setOpenColumnMenuKey(vc.key);
                  }}
                  className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-500 flex-shrink-0"
                  title="Column options"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {isMenuOpen && columnMenuPos && createPortal(
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
                          pinSide === "left" ? unpinColumn(vc.key) : pinColumnToSide(vc.key, "left");
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${pinSide === "left" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
                      >
                        {pinSide === "left" ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />}
                        Pin to Left
                      </button>
                      <button
                        onClick={() => {
                          setOpenColumnMenuKey(null);
                          setColumnMenuPos(null);
                          pinSide === "right" ? unpinColumn(vc.key) : pinColumnToSide(vc.key, "right");
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${pinSide === "right" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
                      >
                        {pinSide === "right" ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5 text-[#1C1B1F]" />}
                        Pin to Right
                      </button>

                      {isSortable && (
                        <>
                          <button
                            onClick={() => {
                              setOpenColumnMenuKey(null);
                              setColumnMenuPos(null);
                              const isActive = sortConfig.key === vc.key && sortConfig.direction === "asc";
                              setSortConfig(isActive ? { key: null, direction: null } : { key: vc.key, direction: "asc" });
                              setPagination((prev) => ({ ...prev, currentPage: 1 }));
                            }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${sortConfig.key === vc.key && sortConfig.direction === "asc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                          >
                            <ChevronUp className="w-3.5 h-3.5 text-[#1C1B1F]" />
                            Sort Ascending
                          </button>
                          <button
                            onClick={() => {
                              setOpenColumnMenuKey(null);
                              setColumnMenuPos(null);
                              const isActive = sortConfig.key === vc.key && sortConfig.direction === "desc";
                              setSortConfig(isActive ? { key: null, direction: null } : { key: vc.key, direction: "desc" });
                              setPagination((prev) => ({ ...prev, currentPage: 1 }));
                            }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${sortConfig.key === vc.key && sortConfig.direction === "desc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                          >
                            <ChevronDown className="w-3.5 h-3.5 text-[#1C1B1F]" />
                            Sort Descending
                          </button>
                        </>
                      )}

                      <div className="w-full border-t border-[#F1F1F5] my-0.5" />

                      <button
                        disabled={vc.required}
                        onClick={() => {
                          if (vc.required) return;
                          setOpenColumnMenuKey(null);
                          setColumnMenuPos(null);
                          saveColumns(
                            columns.map((c) => (c.key === vc.key ? { ...c, visible: false } : c)),
                          );
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal whitespace-nowrap ${vc.required
                          ? "text-gray-300 cursor-not-allowed"
                          : "text-[#161618] hover:bg-gray-50"
                          }`}
                      >
                        <EyeOff className={`w-3.5 h-3.5 ${vc.required ? "text-gray-300" : "text-[#1C1B1F]"}`} />
                        Hide Column
                      </button>
                    </div>
                  </>,
                  document.body,
                )}
              </div>
            );
          },
          cell: ({ row, getValue }) => {
            // ... Keep all your existing cell rendering logic here exactly as it is ...
            const company = row.original;
            const val = getValue();
            let baseContent;

            if (vc.key === "name") {
              // ... your existing name cell logic
              baseContent = (
                <div className="flex items-center justify-between w-full group relative">
                  <div className="flex items-center min-w-0 flex-1 pr-4">
                    <Link
                      to={`/companies/${company._id}`}
                      state={{ companyIds: sortedCompanies.map((c) => c._id) }}
                      className="text-[#0085FF] font-semibold hover:underline truncate transition-all duration-150 ease-out group-hover:text-[#004CFF] min-w-0"
                      title={company.name}
                    >
                      <HighlightText text={company.name} query={searchTerm} />
                    </Link>
                    {company.isStarred && (
                      <StarIcon className="flex-shrink-0 w-3.5 h-3.5 ml-1.5 text-yellow-400 fill-yellow-400" />
                    )}
                  </div>
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all duration-150 ease-out pointer-events-none group-hover:pointer-events-auto bg-white/80 backdrop-blur-[2px] border border-gray-200 rounded-full">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setQuickViewCompanyId(company._id);
                      }}
                      className="p-1.5 rounded-full hover:bg-blue-50 text-blue-600 transition-colors"
                      title="Quick view"
                    >
                      <EyeIcon size={15} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(company);
                      }}
                      className="p-1.5 rounded-full hover:bg-blue-50 text-gray-500 hover:text-blue-600 transition-colors duration-150"
                      title="Edit Company"
                    >
                      <EditIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(company._id);
                      }}
                      className="p-1.5 rounded-full hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors duration-150"
                      title="Delete Company"
                    >
                      <DeleteIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            }
            if (vc.key === "industry") {
              baseContent = <div className="truncate text-sm text-gray-700 capitalize font-medium" title={company.industry}>{company.industry ? <HighlightText text={company.industry} query={searchTerm} /> : "—"}</div>;
            } else if (vc.key === "address") {
              const address = company.address;
              baseContent = (
                <div className="truncate text-sm text-gray-700" title={address}>
                  <HighlightText text={truncateText(address, 30)} query={searchTerm} />
                </div>
              );
            } else if (vc.key === "website") {
              baseContent = company.website ? (
                <a href={company.website.startsWith("http") ? company.website : `https://${company.website}`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline truncate block w-full" title={company.website}><HighlightText text={company.website} query={searchTerm} /></a>
              ) : <span className="text-sm text-gray-400">—</span>;
            } else if (vc.key === "gstin") {
              baseContent = <div className="truncate text-sm text-gray-700 font-mono w-full" title={company.gstin}>{company.gstin ? <HighlightText text={company.gstin} query={searchTerm} /> : "—"}</div>;
            } else if (vc.key === "leadSource") {
              baseContent = <span className="truncate text-sm text-gray-700" title={company.leadSource}>{company.leadSource ? <HighlightText text={company.leadSource} query={searchTerm} /> : "—"}</span>;
            } else if (baseContent === undefined) {
              const truncated = truncateText(String(val), 30);
              baseContent = (
                <div className="truncate text-sm text-gray-700 w-full" title={String(val)}>
                  {truncated ? <HighlightText text={truncated} query={searchTerm} /> : "—"}
                </div>
              );
            }

            if (vc.key === lastColumnKey) {
              return (
                <div className="flex items-center justify-between w-full gap-2">
                  <div className="min-w-0 flex-1">{baseContent}</div>
                  {renderRowActionsMenu(company)}
                </div>
              );
            }
            return baseContent;
          },
        })
      );
    });

    return cols;
  }, [
    selectionMode,
    visibleColumns,
    selectedCompaniesSet,
    sortedCompanies,
    sortConfig,
    pinnedColumns,
    openRowActionsId,
    openColumnMenuKey,
    columnMenuPos,
    searchTerm,
  ]);

  const table = useReactTable({
    data: sortedCompanies,
    columns: tableColumns,
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    enableColumnResizing: true,
  });

  const handleDelete = async (companyId) => {
    setCompanyToDelete(companyId);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!companyToDelete) return;

    const loadingToast = toast.loading("Deleting company...");

    try {
      setLoading(true);
      await API.delete(`/companies/${companyToDelete}`);
      await fetchCompanies();
      toast.success("Company deleted successfully!", { id: loadingToast });
    } catch (err) {
      let errorMessage = "Failed to delete company";
      if (err.response && err.response.status === 402) {
        errorMessage = err.response.data.message || "An active subscription is required to make changes.";
      } else if (err.response && err.response.status === 403) {
        errorMessage = err.response.data.message || err.response.data.error || "Access denied";
      }
      toast.error(errorMessage, { id: loadingToast });
    } finally {
      setLoading(false);
      setShowDeleteModal(false);
      setCompanyToDelete(null);
    }
  };

  // Long press handlers
  const handleMouseDown = (companyId) => {
    const timer = setTimeout(() => {
      setSelectionMode(true);
      handleSelectCompany(companyId);
    }, 500);
    setLongPressTimer(timer);
  };

  const handleMouseUp = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  // Long-press-to-select is disabled on touch devices — mobile rows should
  // only enter selection via the checkbox itself, never by holding the row.
  const handleTouchStart = () => { };

  const handleTouchEnd = () => { };

  // Truncate text
  const truncateText = (text, maxLength = 30) => {
    if (!text) return "—";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  // Exit selection mode
  const exitSelectionMode = () => {
    setSelectionMode(true);
    setSelectedCompanies([]);
  };

  // Debounced search effect
  // Pagination lives in the Zustand store, so it OUTLIVES this component —
  // leaving the page on 3 and coming back would otherwise remount still on 3.
  // Reset to page 1 on unmount so a return visit always starts at page 1 with a
  // single fetch. Doing it here (on the way out) rather than on mount is what
  // avoids the flicker: if we reset on mount instead, the first fetch would
  // already be in flight for page 3, land, paint page-3 rows, and only then get
  // replaced by page 1.
  useEffect(() => {
    return () => {
      setPagination((prev) => ({ ...prev, currentPage: 1 }));
    };
  }, [setPagination]);

  // Debounced reset-to-page-1 when the search/filter changes. Skips the initial
  // mount: on a return visit this used to fire a 300ms-delayed setPagination
  // that raced the in-flight page-3 fetch, producing exactly the
  // "page 3 rows appear, then snap to page 1" flicker.
  const skipInitialPageReset = useRef(true);
  useEffect(() => {
    if (skipInitialPageReset.current) {
      skipInitialPageReset.current = false;
      return;
    }
    const timer = setTimeout(() => {
      setPagination((prev) => ({ ...prev, currentPage: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, filterIndustry]);

  // Fetch data when dependencies change. Skipped on the very first mount when
  // a `?search=` deep link is pending — that leaves the search-term effect
  // below as the only initial fetch, instead of racing an empty-search fetch
  // against it (see initialSearchFromUrl above for why that race matters).
  const skipMountFetchForUrlSearch = useRef(!!initialSearchFromUrl);
  useEffect(() => {
    if (skipMountFetchForUrlSearch.current) {
      skipMountFetchForUrlSearch.current = false;
      return;
    }
    fetchCompanies();
  }, [pagination.currentPage, pagination.limit, sortConfig]);

  const fetchAllContacts = async () => {
    try {
      const res = await API.get("/contacts");
      setAllContacts(res.data);
    } catch (err) {
      console.error("Failed to load contacts for notes");
    }
  };

  // Separate effect for search/filter to trigger reset + fetch.
  // Skips the initial mount — the [pagination.currentPage, ...] effect above
  // already fires the first fetch, and running both here would race a second,
  // duplicate request that can resolve first and clear `loading` early.
  const skipInitialSearchFetch = useRef(true);
  useEffect(() => {
    if (skipInitialSearchFetch.current) {
      skipInitialSearchFetch.current = false;
      return;
    }
    if (pagination.currentPage === 1) {
      fetchCompanies();
    }
  }, [searchTerm, filterIndustry]);

  // INITIALIZE: Fetch field names first
  useEffect(() => {
    const initialize = async () => {
      await fetchCompanyFieldNames(); // Wait for this to complete
      await fetchUser();
      await fetchIndustries(); // Fetch industries
      await fetchAllContacts();
    };
    initialize();
  }, []);

  const fetchUser = async () => {
    try {
      const res = await API.get("/auth/me");
      const user = res.data;
      const userPerm = user?.user?.permissions?.find(
        (p) => p.name.toLowerCase() === "companies",
      );
      setPermission(userPerm?.permission || "no");
      setIsAdmin(user?.user?.role === "admin");
    } catch {
      setPermission("no");
      toast.error("Failed to fetch user permissions");
    }
  };

  const fetchCompanyFieldNames = async () => {
    try {
      const res = await API.get("/company-fields");
      if (res.data) {
        const fields = res.data.fields || [];
        console.log("✅ Fetched custom fields:", fields);
        setCompanyFieldNames(fields);
      }
    } catch (err) {
      console.error("Failed to fetch company fields");
      if (err.response?.status !== 402) {
        toast.error("Failed to fetch company fields", { id: "companies-fields-error" });
      }
    }
  };

  const fetchIndustries = async () => {
    try {
      setIndustriesLoading(true);

      // Default system industries
      const defaultIndustries = [
        "Information Technology & Services",
        "Finance & Banking",
        "Healthcare & Pharmaceuticals",
        "Education & EdTech",
        "Retail & E-Commerce",
        "Manufacturing",
        "Real Estate",
        "Marketing & Advertising",
        "Travel & Hospitality",
        "Nonprofit / Government / Public Sector",
      ];

      // Fetch custom industries from API
      const res = await API.get("/company-industries");
      let customIndustries = [];

      if (res.data) {
        // Get custom industries (filter out default ones from API)
        const custom = res.data.filter((ind) => !ind.isDefault) || [];
        customIndustries = custom.map((ind) => ind.name);
      }

      // Combine default and custom industries, remove duplicates, and sort
      const allIndustries = [
        ...new Set([...defaultIndustries, ...customIndustries]),
      ].sort();
      setIndustries(allIndustries);
    } catch (err) {
      console.error("Failed to fetch industries", err);
      if (err.response?.status !== 402) {
        toast.error("Failed to fetch industries");
      }
    } finally {
      setIndustriesLoading(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.currentPage.toString(),
        limit: pagination.limit.toString(),
      });
      if (sortConfig.key) {
        params.append("sortBy", sortConfig.key);
        params.append("sortOrder", sortConfig.direction || "asc");
      } else {
        // No column sort applied — show newest-added first, without
        // marking any header as actively sorted.
        params.append("sortBy", "createdAt");
        params.append("sortOrder", "desc");
      }

      if (searchTerm.trim()) {
        params.append("search", searchTerm.trim());
      }
      if (filterIndustry) {
        params.append("industry", filterIndustry);
      }

      if (activeFilters && activeFilters.length > 0) {
        params.append("advancedFilters", JSON.stringify(activeFilters));
      }

      const res = await API.get(`/companies/pagination?${params.toString()}`);

      if (res.data.companies && res.data.pagination) {
        setCompanies(res.data.companies);
        setCurrentCompanyIds(res.data.companies.map((c) => c._id));
        setPagination((prev) => ({
          ...prev,
          currentPage: res.data.pagination.currentPage,
          totalPages: res.data.pagination.totalPages,
          totalCount: res.data.pagination.totalCount,
          hasNextPage: res.data.pagination.hasNextPage,
          hasPrevPage: res.data.pagination.hasPrevPage,
        }));
      } else {
        setCompanies(res.data || []);
      }
    } catch (err) {
      console.error("Error fetching companies:", err);
      if (err.response?.status === 402) {
        // Subscription state is already shown via the persistent
        // header banner/pill — don't pile on a redundant toast here.
      } else if (err.response && err.response.status === 403) {
        toast.error(err.response.data.error || "Access denied", { id: "companies-load-error" });
      } else {
        toast.error("Failed to load companies", { id: "companies-load-error" });
      }
      setCompanies([]);
    } finally {
      setLoading(false);
      setShowImport(false);
      hasLoadedOnceRef.current = true;
    }
  };

  // "Select All" grabs every company ID matching the current search/filters
  // straight from the database (not just the loaded page). "Deselect All" is
  // its counterpart: it doesn't clear the selection outright (that's what
  // "Cancel" does) — it steps back down to only the rows on the current page.
  const handleSelectAllAcrossPages = async () => {
    try {
      const params = new URLSearchParams({ allIds: "true" });
      if (searchTerm.trim()) params.append("search", searchTerm.trim());
      if (filterIndustry) params.append("industry", filterIndustry);
      if (activeFilters && activeFilters.length > 0) {
        params.append("advancedFilters", JSON.stringify(activeFilters));
      }
      const res = await API.get(`/companies/pagination?${params.toString()}`);
      setSelectedCompanies(res.data.ids || []);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to select all rows");
    }
  };

  const handleDeselectAllExtra = () => {
    setSelectedCompanies(companies.map((c) => c._id));
  };

  // Pagination handlers
  const handlePageChange = (newPage) => {
    if (
      newPage >= 1 &&
      newPage <= pagination.totalPages &&
      newPage !== pagination.currentPage
    ) {
      setPagination((prev) => ({ ...prev, currentPage: newPage }));
    }
  };

  const handleLimitChange = (newLimit) => {
    setPagination((prev) => ({
      ...prev,
      limit: newLimit,
      currentPage: 1,
    }));
  };

  // Bulk selection and actions
  const handleSelectAll = () => {
    if (!hasBulkAccess) {
      setShowUpgradeModal(true);
      return;
    }
    if (selectedCompanies.length === companies.length) {
      setSelectedCompanies([]);
      setSelectionMode(true);
    } else {
      setSelectedCompanies(companies.map((c) => c._id));
      setSelectionMode(true);
    }
  };

  const handleSelectCompany = (companyId) => {
    if (!hasBulkAccess) {
      setShowUpgradeModal(true);
      return;
    }
    setSelectedCompanies((prev) =>
      prev.includes(companyId)
        ? prev.filter((id) => id !== companyId)
        : [...prev, companyId],
    );
  };

  const handleBulkDeleteCompanies = async (itemIds) => {
    setBulkLoading(true);
    try {
      await Promise.all(itemIds.map((id) => API.delete(`/companies/${id}`)));
      await fetchCompanies();
      setSelectedCompanies([]);
      setShowBulkActions(false);
      setSelectionMode(false);
      toast.success(`Successfully deleted ${itemIds.length} companies`);
    } catch (err) {
      toast.error(err.response?.data?.error || "Bulk delete failed");
    } finally {
      setBulkLoading(false);
    }
  };

  const companyFieldConfig = {
    fields: [
      {
        key: "industry",
        label: "Industry",
        type: "text",
      },
      {
        key: "address",
        label: "Address",
        type: "text",
      },
      {
        key: "website",
        label: "Website",
        type: "text",
      },
      {
        key: "gstin",
        label: "GSTIN",
        type: "text",
      },
      ...companyFieldNames.map((field) => ({
        key: field.name || field,
        label: field.name || field,
        type: field.type || "text",
        isCustomField: true,
        options: field.options,
      })),
    ],
  };

  const handleBulkUpdateCompanies = async ({ field, value, itemIds }) => {
    setBulkLoading(true);
    try {
      await Promise.all(
        itemIds.map((id) => {
          let payload = {};
          if (companyFieldNames.some((f) => (f.name || f) === field)) {
            payload.additionalFields = [{ key: field, value }];
          } else {
            payload[field] = value;
          }
          return API.put(`/companies/${id}`, payload);
        }),
      );
      await fetchCompanies();
      setSelectedCompanies([]);
      setShowBulkActions(false);
      setSelectionMode(false);
      toast.success(`Successfully updated ${itemIds.length} companies`);
    } catch (err) {
      toast.error(err.response?.data?.error || "Bulk update failed");
    } finally {
      setBulkLoading(false);
    }
  };

  // Handle saving the bulk note
  const handleBulkNoteSave = async () => {
    if (!noteContent.trim() || noteContent === "<p><br></p>") {
      toast.error("Note content is required");
      return;
    }

    setBulkLoading(true);
    const loadingToast = toast.loading(
      `Adding note to ${selectedCompanies.length} companies...`,
    );

    try {
      await API.post("/notes/bulk", {
        title: noteTitle,
        note: noteContent,
        companyIds: selectedCompanies,
        taggedContacts: taggedContacts.map((c) => c.value),
      });

      toast.success("Notes successfully added!", { id: loadingToast });

      // Reset and close
      setNoteTitle("");
      setNoteContent("");
      setTaggedContacts([]);
      setShowBulkNoteModal(false);
      exitSelectionMode(); // Deselect rows
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.", { id: loadingToast });
      } else {
        toast.error(err.response?.data?.error || "Failed to add notes", { id: loadingToast });
      }
    } finally {
      setBulkLoading(false);
    }
  };

  const getUniqueIndustries = () => {
    return industries; // Return the fetched industries
  };

  // Lock page scroll while a row-actions or column-options menu is open so the
  // background (and the horizontally-scrollable table) can't shift/scroll out from
  // under the portal-positioned menu. Any scroll/wheel/touch/keyboard-scroll attempt
  // closes the menu instead of moving the page.
  useEffect(() => {
    if (!openRowActionsId && !openColumnMenuKey) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const SCROLL_KEYS = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "];
    const closeMenu = () => {
      setOpenRowActionsId(null);
      setRowActionsPos(null);
      setOpenColumnMenuKey(null);
      setColumnMenuPos(null);
    };
    const handleWheel = (e) => {
      e.preventDefault();
      closeMenu();
    };
    const handleTouchMove = () => closeMenu();
    const handleKeyDown = (e) => {
      if (SCROLL_KEYS.includes(e.key)) closeMenu();
    };
    const handleScroll = () => closeMenu();

    window.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true, capture: true });
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    document.addEventListener("scroll", handleScroll, { capture: true });

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("wheel", handleWheel, { capture: true });
      window.removeEventListener("touchmove", handleTouchMove, { capture: true });
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      document.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [openRowActionsId, openColumnMenuKey]);

  // Close the Columns/Import overflow menu on scroll — it's absolutely
  // positioned off its own button, so a scroll that moves that button would
  // otherwise leave it floating detached from its anchor.
  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const handleScroll = () => setIsMoreMenuOpen(false);
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [isMoreMenuOpen]);

  // Click outside listener for the overflow menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(event.target)
      ) {
        setIsMoreMenuOpen(false);
      }
      // Row-actions is no longer closed here — it's now portaled to
      // document.body (see renderRowActionsMenu), which puts it outside
      // rowActionsRef's DOM subtree. This document-level "mousedown outside"
      // check would then fire on every mousedown INSIDE the menu too, and
      // because mousedown runs before the item's own click, it would unmount
      // the menu before "View Company"/"Edit"/"Delete" etc. ever received the
      // click. The portaled menu closes itself via its own full-screen
      // backdrop instead.
      if (
        columnMenuRef.current &&
        !columnMenuRef.current.contains(event.target)
      ) {
        setOpenColumnMenuKey(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Separate effect for advanced filters
  useEffect(() => {
    if (pagination.currentPage === 1) {
      fetchCompanies();
    } else {
      setPagination((prev) => ({ ...prev, currentPage: 1 }));
    }
  }, [activeFilters]);

  // Get field value from company
  const getFieldValue = (company, columnKey) => {
    // Check if it's a base field
    if (company[columnKey] !== undefined) {
      return company[columnKey];
    }

    // Check additional fields
    const additionalField = company.additionalFields?.find(
      (field) => field.key === columnKey,
    );
    return additionalField?.value || "—";
  };


  // Pagination component
  const PaginationControls = () => {
    const {
      currentPage,
      totalPages,
      totalCount,
      limit,
      hasNextPage,
      hasPrevPage,
    } = pagination;

    if (totalCount === 0) return null;

    const startItem = (currentPage - 1) * limit + 1;
    const endItem = Math.min(currentPage * limit, totalCount);

    return (
      <div className="w-full bg-white px-4 py-3 flex items-center justify-between sm:px-6">
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
              <span className="font-semibold">{totalCount}</span> results
            </p>
            <div className="relative ml-2">
              <select
                value={limit}
                onChange={(e) => handleLimitChange(parseInt(e.target.value))}
                className="appearance-none border border-gray-300 rounded-lg pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-inter"
              >
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
                <option value={150}>150 per page</option>
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={!hasPrevPage}
              className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {(() => {
              const commitPage = () => {
                const n = parseInt(pageInput, 10);
                if (!Number.isNaN(n)) handlePageChange(Math.min(Math.max(n, 1), totalPages));
                setEditingPage(false);
              };
              const items = [1];
              if (currentPage > 2) items.push("left-dots");
              if (currentPage !== 1 && currentPage !== totalPages) items.push(currentPage);
              if (currentPage < totalPages - 1) items.push("right-dots");
              if (totalPages > 1) items.push(totalPages);

              return items.map((item, index) => {
                if (item === "left-dots" || item === "right-dots") {
                  return (
                    <span
                      key={`${item}-${index}`}
                      className="flex items-center justify-center w-8 h-8 text-sm font-medium text-gray-400 select-none"
                    >
                      ....
                    </span>
                  );
                }
                const isCurrent = item === currentPage;
                if (isCurrent && editingPage) {
                  return (
                    <input
                      key="page-edit"
                      autoFocus
                      type="number"
                      min={1}
                      max={totalPages}
                      value={pageInput}
                      onChange={(e) => setPageInput(e.target.value)}
                      onBlur={commitPage}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitPage();
                        if (e.key === "Escape") setEditingPage(false);
                      }}
                      className="w-10 h-8 rounded-full border border-blue-500 text-center text-sm font-medium text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  );
                }
                return (
                  <button
                    key={`page-${item}`}
                    onClick={() => handlePageChange(item)}
                    onDoubleClick={() => {
                      if (isCurrent) {
                        setPageInput(String(currentPage));
                        setEditingPage(true);
                      }
                    }}
                    title={isCurrent ? "Double-click to type a page number" : undefined}
                    className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${isCurrent
                      ? "bg-[#0085FF] text-white"
                      : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                      }`}
                  >
                    {item}
                  </button>
                );
              });
            })()}

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={!hasNextPage}
              className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };



  const resetForm = () => {
    setForm({
      name: "",
      industry: "",
      address: "",
      website: "",
      gstin: "",
      leadSource: "",
      profilePicture: null,
      profilePictureUrl: "",
    });
    setAdditionalFields({});
  };

  const toggleForm = () => {
    if (showForm) {
      resetForm();
    }
    setShowForm(!showForm);
  };

  const handleEdit = (company) => {
    // Edit uses the same QuickCompanyForm as create (single shared form).
    setEditCompany(company);
    setShowQuickAdd(true);
  };

  return (
    <div className="-mt-6 -mx-4 sm:-mx-6 lg:-mx-8 pt-4">
      <AppToaster />

      {/* Video Tutorial Modal */}
      <VideoTutorialModal
        isOpen={showVideoTutorial}
        onClose={() => setShowVideoTutorial(false)}
        videoId={getVideoTutorial("companies")?.videoId}
        title={getVideoTutorial("companies")?.title}
      />

      {/* Import Clients Modal */}
      <ImportClients
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        companyFieldNames={companyFieldNames}
        onImportSuccess={() => {
          fetchCompanies();
          toast.success("Companies imported successfully");
        }}
      />

      {/* Column Settings Panel */}
      <ColumnSettingsPanel
        isOpen={showColumnSettings}
        onClose={() => setShowColumnSettings(false)}
        columns={columns}
        onSave={saveColumns}
        moduleName="Companies"
      />

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10000] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <DeleteIcon className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2 font-sf">
                Confirm Delete
              </h3>
              <p className="text-sm text-gray-500 font-inter mb-6">
                Are you sure you want to delete this company? This action
                cannot be undone.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Single shared form for both create and edit. */}
      {(showQuickAdd || state?.showAddForm) && (
        <QuickCompanyForm
          editCompany={editCompany}
          onCompanyCreated={() => {
            fetchCompanies();
            setShowQuickAdd(false);
            if (state) state.showAddForm = false;
          }}
          onCompanyUpdated={() => {
            fetchCompanies();
            setShowQuickAdd(false);
            setEditCompany(null);
          }}
          onRequestClose={() => {
            setShowQuickAdd(false);
            setEditCompany(null);
            if (state) state.showAddForm = false;
          }}
        />
      )}

      {/* Main Content Card */}
      <div className="bg-white overflow-visible">
        {/* Toolbar (Title + Search + Buttons) */}
        <div
          className={`fixed right-0 h-16 px-4 sm:px-6 lg:px-8 border-b flex items-center top-[calc(54px+var(--dc-offline-offset,0px))] lg:top-[calc(64px+var(--dc-offline-offset,0px))] bg-white border-[#E1E4EA]`}
          style={{
            left: "var(--sidebar-width, 0px)",
            zIndex: 40,
            minHeight: "64px",
            maxHeight: "64px",
            boxSizing: "border-box",
          }}
        >
          {showBulkStrip ? (
            <div className={`${bulkStripClosing ? "animate-slideOutRight" : "animate-slideInLeft"} flex flex-nowrap items-center justify-between gap-4 w-full h-full overflow-x-auto`}>
              {/* One joined strip instead of six separate pills: no gap between
                  buttons, square inner edges, rounding only on the two outer
                  corners, and each border pulled left by 1px (-ml-px) onto its
                  neighbor so touching borders don't double up into a thick
                  seam. */}
              <div className="flex flex-nowrap items-center flex-shrink-0">
                {/* All six buttons share one neutral treatment now — white fill,
                    black border, black text — with only the icon carrying each
                    action's colour as an accent. */}
                <button
                  onClick={() => setShowExportModal(true)}
                  className="h-10 px-4 bg-white border border-gray-300 text-gray-900 text-sm font-medium rounded-l-[25px] hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                >
                  <DownloadIcon className="w-4 h-4 text-green-600" />
                  Export
                </button>
                <button
                  onClick={() => setShowBulkNoteModal(true)}
                  className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                >
                  <StickyNote className="w-4 h-4 text-emerald-600" />
                  Add Note
                </button>
                <button
                  onClick={() => setShowAddToHotlistModal(true)}
                  className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                >
                  <FolderPlus className="w-4 h-4 text-blue-600" />
                  Add to Hotlist
                </button>
                <button
                  onClick={() => setShowBulkActions(true)}
                  className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                >
                  <EditIcon className="w-4 h-4 text-blue-600" />
                  Bulk Update
                </button>
                <button
                  onClick={() => setShowBulkDeleteModal(true)}
                  disabled={bulkLoading}
                  className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 disabled:opacity-50 flex-shrink-0 whitespace-nowrap"
                >
                  <DeleteIcon className="w-4 h-4 text-red-600" />
                  Delete
                </button>
                <button
                  onClick={exitSelectionMode}
                  className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium rounded-r-[25px] hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <CheckSquare className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <span className="text-blue-800 font-semibold font-inter whitespace-nowrap">
                  {selectedCompanies.length} compan{selectedCompanies.length !== 1 ? "ies" : "y"} selected
                </span>
                <button
                  onClick={handleSelectAllAcrossPages}
                  className="h-10 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-[25px] hover:bg-gray-50 focus:outline-none transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                >
                  <CheckSquare className="w-4 h-4" />
                  Select All
                </button>
                <button
                  onClick={handleDeselectAllExtra}
                  className="h-10 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-[25px] hover:bg-gray-50 focus:outline-none transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                >
                  <X className="w-4 h-4" />
                  Deselect All
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 lg:gap-4 w-full h-full">
              <div
                className={`flex-shrink-0 flex flex-col justify-center gap-1.5 overflow-hidden transition-opacity duration-300 ease-in-out lg:!w-auto lg:!opacity-100 ${isSearchExpanded ? "w-0 opacity-0" : "w-[190px] opacity-100"}`}
              >
                {showLoadingSkeleton ? (
                  <>
                    <Skeleton width={110} height={18} />
                    <Skeleton width={170} height={12} />
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <h1 className="m-0 leading-tight font-bold text-base sm:text-lg text-gray-900 truncate">Companies</h1>
                      <VideoIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    </div>
                    <p className="m-0 leading-tight text-[10px] sm:text-xs text-gray-500 font-inter truncate">
                      Manage your accounts & company directory
                    </p>
                  </>
                )}
              </div>

              {showLoadingSkeleton ? (
                <div className="relative flex-1 flex items-center justify-end gap-3">
                  <Skeleton width={40} height={40} shape="circle" />
                  <Skeleton width={40} height={40} shape="circle" />
                  <Skeleton width={40} height={40} shape="circle" />
                  <Skeleton width={90} height={40} shape="circle" />
                  <Skeleton width={140} height={40} shape="circle" />
                </div>
              ) : (
                <>
                  <div className="relative flex-1 min-w-0 flex items-center justify-end">
                    <div
                      // Blue border whenever a search is actually applied —
                      // collapsed included. Otherwise a filtered list looks
                      // unfiltered once the box shrinks back to an icon, with
                      // nothing on screen explaining the missing rows.
                      className={`relative h-10 flex items-center border rounded-full bg-white transition-all duration-300 ease-in-out hover:bg-gray-50 focus-within:border-[#0085FF] focus-within:hover:bg-white ${
                        searchTerm ? "border-[#0085FF]" : "border-[#E1E4EA]"
                      } ${isSearchExpanded ? "w-full lg:w-[416px]" : "w-10"} max-w-full`}
                    >
                      <SearchIcon
                        className="absolute left-3 cursor-pointer z-10 flex-shrink-0 top-1/2 -translate-y-1/2 w-4 h-4 text-[#525866]"
                        onClick={() => {
                          setIsSearchExpanded(true);
                          searchInputRef.current?.focus();
                        }}
                      />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onFocus={() => setIsSearchExpanded(true)}
                        onBlur={() => {
                          if (!searchTerm) setIsSearchExpanded(false);
                        }}
                        className={`w-full h-full pl-9 pr-9 bg-transparent text-sm focus:outline-none transition-opacity duration-200 font-inter cursor-pointer ${isSearchExpanded ? "opacity-100 focus:cursor-text" : "opacity-0"}`}
                        placeholder="Search companies by name, industry, or location..."
                      />
                      {/* Clears the typed text only — box stays open, same as
                          backspacing it out by hand. Only shown once there's
                          something to clear. mousedown+preventDefault stops
                          the input's onBlur (which would collapse the box)
                          from firing before the click lands. */}
                      {isSearchExpanded && searchTerm && (
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setSearchTerm("")}
                          aria-label="Clear search"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-5 h-5 rounded-full text-gray-900 hover:bg-gray-100 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Actions Group */}
                  <div className="relative flex items-center gap-2 lg:gap-4 flex-shrink-0">
                    {/* Filters — hidden on mobile, folded into three-dot menu */}
                    <button
                      onClick={() => setShowAdvancedFilters(true)}
                      className="hidden lg:flex relative items-center justify-center w-10 h-10 rounded-full border border-[#E1E4EA] text-[#525866] hover:bg-gray-50 transition-colors"
                      title="Filters"
                    >
                      <FilterIcon size={16} />
                      {activeFilters.length > 0 && (
                        <span className="absolute -top-1 -right-1 bg-[#0085FF] text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                          {activeFilters.length}
                        </span>
                      )}
                    </button>

                    {/* Hotlist — hidden on mobile, folded into three-dot menu */}
                    <button
                      onClick={() => setShowHotlist(!showHotlist)}
                      className={`hidden lg:inline-flex items-center gap-2 h-10 px-4 rounded-full border text-sm font-semibold transition-colors ${showHotlist
                        ? "bg-blue-50 border-[#0085FF] text-blue-700"
                        : "bg-white border-[#E1E4EA] text-[#525866] hover:bg-gray-50"
                        }`}
                    >
                      <HotlistIcon className="w-4 h-4" />
                      <span className="font-medium">Hotlist</span>
                    </button>

                    {/* Overflow menu: Industry filter, Columns, Import, Video Tutorial */}
                    <div className="relative" ref={moreMenuRef}>
                      <button
                        onClick={() => {
                          setIsMoreMenuOpen((prev) => !prev);
                          setOpenRowActionsId(null);
                          setRowActionsPos(null);
                        }}
                        className="relative flex items-center justify-center w-10 h-10 rounded-full border border-[#E1E4EA] text-[#525866] hover:bg-gray-50 transition-colors"
                        title="More options"
                      >
                        <MoreIcon className="w-4 h-4" />
                        {filterIndustry && (
                          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-600" />
                        )}
                      </button>
                      {isMoreMenuOpen && (
                        <div className="absolute right-0 z-50 mt-2 w-44 bg-white border border-gray-100 rounded-xl shadow-xl py-2 animate-in fade-in zoom-in duration-200 origin-top-right">
                          <div className="pt-1">
                            {/* Filters + Hotlist: mobile-only entries */}
                            <button
                              onClick={() => {
                                setShowAdvancedFilters(true);
                                setIsMoreMenuOpen(false);
                              }}
                              className="lg:hidden w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <FilterIcon size={16} />
                              Filters
                              {activeFilters.length > 0 && (
                                <span className="ml-auto bg-[#0085FF] text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                                  {activeFilters.length}
                                </span>
                              )}
                            </button>
                            <button
                              onClick={() => {
                                setShowHotlist((prev) => !prev);
                                setIsMoreMenuOpen(false);
                              }}
                              className="lg:hidden w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <HotlistIcon className="w-4 h-4 text-[#1D4ED8] flex-shrink-0" />
                              {showHotlist ? "Hide Hotlist" : "Hotlist"}
                            </button>
                            <button
                              onClick={() => {
                                setShowColumnSettings(true);
                                setIsMoreMenuOpen(false);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <SettingsIcon className="w-4 h-4 text-gray-400" />
                              Columns
                            </button>
                            <button
                              onClick={() => {
                                setShowImport(true);
                                setIsMoreMenuOpen(false);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <UploadIcon className="w-4 h-4 text-gray-400" />
                              Import
                            </button>
                            <Link
                              to="/settings/company-fields"
                              onClick={() => setIsMoreMenuOpen(false)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <Database className="w-4 h-4 text-gray-400" />
                              Add/View Custom Fields
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Always reads "New Company" — closing the panel is the
                        form's own job (its X / Cancel), not this button's. It
                        used to flip to "Cancel" and toggle-close whenever the
                        panel was already open, which changed label/behaviour
                        out from under whoever was looking at it. */}
                    <button
                      onClick={() => {
                        setEditCompany(null);
                        setShowQuickAdd(true);
                      }}
                      className="inline-flex items-center justify-center gap-2 h-10 w-10 lg:w-auto px-0 lg:px-4 bg-[#0085FF] text-white text-sm font-medium rounded-full hover:bg-blue-600 focus:outline-none cursor-pointer transition-colors flex-shrink-0"
                      title="New Company"
                    >
                      <PlusIcon className="w-4 h-4 flex-shrink-0" />
                      <span className="hidden lg:inline">New Company</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

      <div
        className="overflow-x-auto overflow-y-auto top-[calc(118px+var(--dc-offline-offset,0px))] lg:top-[calc(128px+var(--dc-offline-offset,0px))]"
        style={{
          position: "fixed",
          left: "var(--sidebar-width, 0px)",
          right: 0,
          bottom: !showLoadingSkeleton && !showHotlist ? 64 : 0,
        }}
      >
        {showHotlist ? (
          <Hotlist />
        ) : (
          // No `loading ? "opacity-60 pointer-events-none"` on this container any
          // more. Paging is server-side, so that fired on every page change and
          // dimmed the whole table to 60% for the length of the round trip — the
          // flash that made paging feel like the data blinked out. The rows never
          // actually left (showLoadingSkeleton is gated on an empty list), so the
          // old data now stays fully legible and clickable while the next page
          // loads; the top progress bar reports the fetch instead.
          // No border-t: the toolbar strip right above already has its own
          // border-b, so a top border here would double up against it. No
          // border-b either when there's no data — the table shrinks to just
          // the header + the "No companies found" row, so that border would
          // sit right under it as a second stray line with an odd gap instead
          // of closing off a real table body.
          <div className={`relative bg-white border-r border-[#E1E4EA] ${showLoadingSkeleton || companies.length > 0 ? "border-b" : ""}`} style={{ paddingLeft: "var(--content-inset, 16px)" }}>
            <table
              className="w-full border-separate border-spacing-0 text-left"
              style={{
                minWidth: `${table.getTotalSize()}px`,
                tableLayout: "fixed",
              }}
            >
              {(() => {
                const leftPinnedKeys = pinnedColumns.filter((p) => p.side === "left").map((p) => p.key);
                const rightPinnedKeys = pinnedColumns.filter((p) => p.side === "right").map((p) => p.key);
                const allHeaders = table.getHeaderGroups()[0]?.headers || [];
                // The boundary shadow belongs on the RIGHTMOST pinned column as it
                // actually appears on screen — not whichever was pinned last
                // chronologically (pinnedColumns is in pin-action order, which can
                // differ from display order once more than one column is pinned).
                const leftPinnedInOrder = allHeaders
                  .map((h) => h.column.id)
                  .filter((id) => leftPinnedKeys.includes(id));
                const rightPinnedInOrder = allHeaders
                  .map((h) => h.column.id)
                  .filter((id) => rightPinnedKeys.includes(id));
                const lastLeftPinnedKey = leftPinnedInOrder.length > 0 ? leftPinnedInOrder[leftPinnedInOrder.length - 1] : null;
                const firstRightPinnedKey = rightPinnedInOrder.length > 0 ? rightPinnedInOrder[0] : null;

                  const pinnedLeftOffsets = {};
                  let cumulativeLeft = 0;
                  allHeaders.forEach((h) => {
                    const isLeftStickyCol = h.column.id === "selection" || leftPinnedKeys.includes(h.column.id);
                    if (isLeftStickyCol) {
                      pinnedLeftOffsets[h.column.id] = cumulativeLeft;
                      cumulativeLeft += h.getSize();
                    }
                  });

                  const pinnedRightOffsets = {};
                  let cumulativeRight = 0;
                  [...allHeaders].reverse().forEach((h) => {
                    if (rightPinnedKeys.includes(h.column.id)) {
                      pinnedRightOffsets[h.column.id] = cumulativeRight;
                      cumulativeRight += h.getSize();
                    }
                  });

                return (
                  <>
                    <thead className="bg-[#F5F7FA] border-b border-[#E1E4EA] sticky top-0 z-30 select-none">
                      {table.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id}>
                          {headerGroup.headers.map((header) => {
                            const colId = header.column.id;
                            const isLeftSticky = colId === "selection" || leftPinnedKeys.includes(colId);
                            const isRightSticky = rightPinnedKeys.includes(colId);
                            const isSticky = isLeftSticky || isRightSticky;
                            const isLeftBoundary = colId === lastLeftPinnedKey;
                            const isRightBoundary = colId === firstRightPinnedKey;
                            const boundaryShadowSide = isLeftBoundary ? "left" : isRightBoundary ? "right" : null;
                            const isDraggable = colId !== "selection";
                            const isDragging = draggedColKey === colId;
                            const isDragOver = dragOverColKey === colId && draggedColKey && draggedColKey !== colId;

                            return (
                              <th
                                key={header.id}
                                data-col-id={colId}
                                onMouseDown={isDraggable ? (e) => startColumnDrag(e, colId) : undefined}
                                style={{
                                  width: header.getSize(),
                                  position: isSticky ? "sticky" : "relative",
                                  left: isLeftSticky ? pinnedLeftOffsets[colId] ?? 0 : "auto",
                                  right: isRightSticky ? pinnedRightOffsets[colId] ?? 0 : "auto",
                                  zIndex: isSticky ? 20 : 1,
                                }}
                                className={`px-4 py-3 text-sm font-bold text-[#525866] border-r border-[#E1E4EA] last:border-r-0 transition-colors bg-[#F5F7FA] ${isDraggable ? "cursor-grab active:cursor-grabbing" : ""} ${isDragOver ? "bg-blue-100" : "hover:bg-gray-100"}`}
                              >
                                {/* Opacity lives on this wrapper, not the <th>, so dragging a
                                    column never dims its sticky positioning, borders or the
                                    pinned-boundary shadow — only its own label fades. */}
                                <div className="w-full min-w-0" style={{ opacity: isDragging ? 0.35 : 1 }}>
                                  {flexRender(
                                    header.column.columnDef.header,
                                    header.getContext(),
                                  )}
                                </div>
                                {boundaryShadowSide && (
                                  <div style={getPinnedBoundaryOverlayStyle(boundaryShadowSide)} />
                                )}

                                {colId !== "selection" && header.column.getCanResize() && (
                                  <div
                                    data-resize-handle="true"
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      header.getResizeHandler()(e);
                                    }}
                                    onTouchStart={header.getResizeHandler()}
                                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none z-50 bg-transparent"
                                  />
                                )}
                              </th>
                            );
                          })}
                        </tr>
                      ))}
                    </thead>

                    <tbody className="bg-white">
                        {showLoadingSkeleton ? (
                          <TableSkeletonRows numRows={pagination.limit} columns={table.getVisibleLeafColumns().filter((c) => c.id !== "selection")} hasCheckbox />
                        ) : companies.length === 0 ? (
                          <tr>
                            <td colSpan={table.getAllColumns().length} className="px-6 py-12 text-center text-gray-500 font-inter">
                              <p className="font-medium">No companies found</p>
                            </td>
                          </tr>
                        ) : (
                          table.getRowModel().rows.map((row) => (
                            <tr
                              key={row.id}
                              className={`bg-white hover:bg-blue-50 transition-colors ${selectedCompaniesSet.has(row.original._id) ? "!bg-blue-50" : ""}`}
                              style={{ height: 37, maxHeight: 37 }}
                              onMouseDown={() => handleMouseDown(row.original._id)}
                              onMouseUp={handleMouseUp}
                              onMouseLeave={handleMouseUp}
                              onTouchStart={() => handleTouchStart(row.original._id)}
                              onTouchEnd={handleTouchEnd}
                            >
                              {row.getVisibleCells().map((cell) => {
                                const colId = cell.column.id;
                                const isLeftSticky = colId === "selection" || leftPinnedKeys.includes(colId);
                                const isRightSticky = rightPinnedKeys.includes(colId);
                                const isSticky = isLeftSticky || isRightSticky;
                                const isLeftBoundary = colId === lastLeftPinnedKey;
                                const isRightBoundary = colId === firstRightPinnedKey;
                                const cellBoundaryShadowSide = isLeftBoundary ? "left" : isRightBoundary ? "right" : null;
                                const isColDragging = draggedColKey === colId;

                                return (
                                  <td
                                    key={cell.id}
                                    style={{
                                      width: cell.column.getSize(),
                                      height: "37px",
                                      maxHeight: "37px",
                                      boxSizing: "border-box",
                                      position: isSticky ? "sticky" : "static",
                                      left: isLeftSticky ? pinnedLeftOffsets[colId] ?? 0 : "auto",
                                      right: isRightSticky ? pinnedRightOffsets[colId] ?? 0 : "auto",
                                      zIndex: isSticky ? 10 : 1,
                                    }}
                                    className="px-4 py-2 align-middle text-sm text-[#1C1B1F] bg-inherit border-r border-b border-[#E1E4EA] last:border-r-0"
                                  >
                                    <div style={{ opacity: isColDragging ? 0.35 : 1, overflow: colId === "name" ? "visible" : "hidden" }}>
                                      {flexRender(
                                        cell.column.columnDef.cell,
                                        cell.getContext(),
                                      )}
                                    </div>
                                    {cellBoundaryShadowSide && (
                                      <div style={getPinnedBoundaryOverlayStyle(cellBoundaryShadowSide)} />
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </>
                  );
                })()}
              </table>
            </div>
          )}
        </div>

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
            <div
              key={i}
              className="px-4 py-2 border-b border-[#F1F1F5] last:border-b-0"
            >
              <span className="text-sm text-gray-700 truncate block">{rowVal}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}

      {!showLoadingSkeleton && !showHotlist && (
        <div
          className={`fixed bottom-0 right-0 bg-white border-t border-[#E1E4EA] shadow-sm z-[9992] flex items-center ${isSearchOverlayOpen ? "pointer-events-none" : ""}`}
          style={{
            left: "var(--sidebar-width, 0px)",
            height: 64,
            // Same reasoning as the sidebar in Navbar.jsx — dims itself rather
            // than depending on the overlay's backdrop to cover it by z-index
            // alone. brightness(0.6) matches the bg-black/40 backdrop exactly
            // (black 40% over a colour == 0.6 * colour), so this bar darkens in
            // lockstep with the page instead of just fading over the body.
            filter: isSearchOverlayOpen ? "brightness(0.6)" : "none",
          }}
        >
          {PaginationControls()}
        </div>
      )}
    </div>

      <BulkDeleteModal
        isOpen={showBulkDeleteModal}
        message={
          <>
            Are you sure you want to delete <strong>{selectedCompanies.length}</strong> companies?
            This action cannot be undone.
          </>
        }
        loading={bulkLoading}
        onCancel={() => setShowBulkDeleteModal(false)}
        onConfirm={async () => {
          await handleBulkDeleteCompanies(selectedCompanies);
          setShowBulkDeleteModal(false);
        }}
        onExportBeforeDelete={() => {
          const records = companies.filter((c) => selectedCompanies.includes(c._id));
          exportRecordsToCSV(records, "companies");
        }}
      />

      <BulkActions
        isOpen={showBulkActions}
        onClose={() => setShowBulkActions(false)}
        selectedItems={companies.filter((c) =>
          selectedCompanies.includes(c._id),
        )}
        onBulkUpdate={handleBulkUpdateCompanies}
        fieldConfig={companyFieldConfig}
        module="companies"
      />

      <AdvancedFilterPanel
        isOpen={showAdvancedFilters}
        onClose={() => setShowAdvancedFilters(false)}
        columns={defaultColumns}
        filters={activeFilters}
        setFilters={setActiveFilters}
        onApply={(newFilters) => setActiveFilters(newFilters)}
        title="Filter Companies"
        subtitle="Find specific accounts quickly"
        emptyStateText="Add a rule to narrow down your company list."
      />

      <AddToCompanyHotlistModal
        isOpen={showAddToHotlistModal}
        onClose={() => setShowAddToHotlistModal(false)}
        selectedCompanyIds={selectedCompanies}
        onComplete={() => {
          setSelectionMode(true);
          setSelectedCompanies([]);
        }}
      />

      <AddToCompanyHotlistModal
        isOpen={!!quickHotlistCompanyId}
        onClose={() => setQuickHotlistCompanyId(null)}
        selectedCompanyIds={quickHotlistCompanyId ? [quickHotlistCompanyId] : []}
        onComplete={() => setQuickHotlistCompanyId(null)}
      />

      {/* Set/Change Company Owner — pick a contact from this org's contact list */}
      {ownerPickerCompanyId && (
        <div
          className="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center p-4"
          onClick={() => setOwnerPickerCompanyId(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Set Company Owner</h3>
              <button
                onClick={() => setOwnerPickerCompanyId(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 pt-3 pb-2">
              <input
                type="text"
                autoFocus
                placeholder="Search users..."
                value={ownerPickerSearch}
                onChange={(e) => setOwnerPickerSearch(e.target.value)}
                className="w-full border border-gray-200 rounded-full px-3 h-9 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            {companies.find((c) => c._id === ownerPickerCompanyId)?.owner && (
              <div className="px-4 pb-2">
                <button
                  disabled={ownerPickerSaving}
                  onClick={async () => {
                    setOwnerPickerSaving(true);
                    try {
                      await API.patch(`/companies/${ownerPickerCompanyId}/owner`, {
                        ownerId: null,
                      });
                      setCompanies((prev) =>
                        prev.map((c) =>
                          c._id === ownerPickerCompanyId ? { ...c, owner: null } : c
                        )
                      );
                      toast.success("Company owner removed");
                      setOwnerPickerCompanyId(null);
                    } catch (err) {
                      toast.error(err.response?.data?.error || "Failed to remove owner");
                    } finally {
                      setOwnerPickerSaving(false);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                  Remove Owner
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-2 pb-2">
              {orgUsers
                .filter((u) => u.role === "staff")
                .filter((u) =>
                  !ownerPickerSearch.trim() ||
                  u.name?.toLowerCase().includes(ownerPickerSearch.trim().toLowerCase()) ||
                  u.email?.toLowerCase().includes(ownerPickerSearch.trim().toLowerCase())
                )
                .map((orgUser) => (
                  <button
                    key={orgUser._id}
                    disabled={ownerPickerSaving}
                    onClick={async () => {
                      setOwnerPickerSaving(true);
                      try {
                        const res = await API.patch(`/companies/${ownerPickerCompanyId}/owner`, {
                          ownerId: orgUser._id,
                        });
                        setCompanies((prev) =>
                          prev.map((c) =>
                            c._id === ownerPickerCompanyId ? { ...c, owner: res.data.owner } : c
                          )
                        );
                        toast.success(`${orgUser.name} set as company owner`);
                        setOwnerPickerCompanyId(null);
                      } catch (err) {
                        toast.error(err.response?.data?.error || "Failed to set owner");
                      } finally {
                        setOwnerPickerSaving(false);
                      }
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-gray-50 text-left disabled:opacity-50"
                  >
                    <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {(orgUser.name || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-900 truncate">{orgUser.name}</p>
                      {orgUser.email && (
                        <p className="text-xs text-gray-500 truncate">{orgUser.email}</p>
                      )}
                    </div>
                    <span className="text-[10px] uppercase font-medium text-gray-400 flex-shrink-0">
                      {orgUser.role}
                    </span>
                  </button>
                ))}
              {orgUsersLoaded && orgUsers.filter((u) => u.role === "staff").length === 0 && (
                <p className="text-sm text-gray-500 text-center py-6">No staff users found.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Export Selected Companies Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        columns={defaultColumns}
        selectedIds={selectedCompanies}
        exportUrl="/companies/export-selected"
        fileName="Exported_Companies.csv"
      />

      {/* Bulk Note Modal */}
      <NoteEditor
        isOpen={showBulkNoteModal}
        onClose={() => setShowBulkNoteModal(false)}
        noteTitle={noteTitle}
        setNoteTitle={setNoteTitle}
        noteContent={noteContent}
        setNoteContent={setNoteContent}
        taggedContacts={taggedContacts}
        setTaggedContacts={setTaggedContacts}
        contacts={allContacts}
        onSave={handleBulkNoteSave}
        loading={bulkLoading}
        isEditing={false}
      />

      {quickViewCompanyId && (
        <CompanyQuickView
          companyId={quickViewCompanyId}
          onClose={() => setQuickViewCompanyId(null)}
          onEdit={(company) => {
            handleEdit(company);
            setQuickViewCompanyId(null);
          }}
        />
      )}

      <UpgradeRequiredModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        minPlan="growth"
        feature="Selecting multiple rows"
      />
    </div>
  );
}

export default Companies;
