import CalendarIcon from "../components/common/CalendarIcon";
import PdfIcon from "../components/common/PdfIcon";
import AddCallIcon from "../components/common/AddCallIcon";
import CellphoneIcon from "../components/common/CellphoneIcon";
import PlusIcon from "../components/common/PlusIcon";
import MoreIcon from "../components/common/MoreIcon";
import React, { useEffect, useState, useRef, useCallback, useLayoutEffect } from "react";
import { useParams, Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import API from "../services/api";
import { useTopLoadingSignal } from "../components/common/TopLoadingBar";
import CompanyDealsKanban from "../components/company/CompanyDealsKanban";
import CompanyContactsTab from "../components/company/CompanyContactsTab";
import CompanyInvoicesTab from "../components/company/CompanyInvoicesTab";
import CompanyNotesTab from "../components/company/CompanyNotesTab";
import CompanyTasksTab from "../components/company/CompanyTasksTab";
import CompanyMeetingsTab from "../components/company/CompanyMeetingsTab";
import CompanyFolderTab from "../components/company/CompanyFolderTab";
import CompanyCallLogsTab from "../components/company/CompanyCallLogsTab";
import CompanyCalendar from "../components/company/CompanyCalendar";
import ProfilePicture from "../components/contact/ProfilePicture";
import toast from "react-hot-toast";
import AppToaster from "../components/AppToaster";
import logo from "/DataCircles.png";
import {
  MapPin,
  Twitter,
  Linkedin,
  Instagram,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Building2,
  CopyPlus,
  BriefcaseBusiness,
  Receipt,
  CheckSquare,
  Mail,
  File,
  StickyNote,
  FolderOpen,
  LayoutGrid,
  X,
  User,
  Clock,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import QuickCompanyForm from "../components/company/QuickCompanyForm";
import SubsidiaryModal from "../components/company/SubsidiaryModal";
import MergeCompanyModal from "../components/company/MergeCompanyModal";
import StatTile from "../components/common/StatTile";
import StatTileSkeleton from "../components/common/StatTileSkeleton";

const tabs = [
  "Overview",
  "Deals",
  "Contacts",
  "Invoices",
  "Notes",
  "Tasks",
  "Meetings",
  "Call Logs",
  "Folders",
  "Calendar",
];

const newEntryOptions = [
  { label: "New Deal", icon: BriefcaseBusiness, tab: "Deals", create: "deal" },
  { label: "New Contact", icon: TeamIcon, tab: "Contacts", create: "contact" },
  { label: "New Invoice", icon: PdfIcon, tab: "Invoices", create: "invoice" },
  { label: "New Notes", icon: StickyNote, tab: "Notes", create: "note" },
  { label: "New Meetings", icon: CalendarIcon, tab: "Meetings", create: "meeting" },
  { label: "New Call Log", icon: AddCallIcon, tab: "Call Logs", create: "call" },
  { label: "New Folders", icon: FolderOpen, tab: "Folders", create: "folder" },
];

// Array of cool loading messages
const loadingMessages = [
  "Getting to know your client a little better…",
  "Pulling up everything about this company — hang tight!",
  "Gathering insights and recent updates for you…",
  "Almost there — just connecting the dots…",
  "Loading client vibes and business details…",
  "One sec — organizing everything about this client…",
  "Crunching data to give you the full picture…",
  "Bringing this company's story onto your screen…",
  "Building your client view — good things take a moment."
];

// Select a random message
const randomMessage = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];

const LifetimeRevenueIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="8 8 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M13.3077 28.5C12.8091 28.5 12.3831 28.3234 12.0298 27.9703C11.6766 27.6169 11.5 27.1909 11.5 26.6923V13.3077C11.5 12.8091 11.6766 12.3831 12.0298 12.0298C12.3831 11.6766 12.8091 11.5 13.3077 11.5H26.6923C27.1909 11.5 27.6169 11.6766 27.9703 12.0298C28.3234 12.3831 28.5 12.8091 28.5 13.3077V16.029H27V13.3077C27 13.2179 26.9712 13.1442 26.9135 13.0865C26.8558 13.0288 26.7821 13 26.6923 13H13.3077C13.2179 13 13.1442 13.0288 13.0865 13.0865C13.0288 13.1442 13 13.2179 13 13.3077V26.6923C13 26.7821 13.0288 26.8558 13.0865 26.9135C13.1442 26.9712 13.2179 27 13.3077 27H26.6923C26.7821 27 26.8558 26.9712 26.9135 26.9135C26.9712 26.8558 27 26.7821 27 26.6923V23.971H28.5V26.6923C28.5 27.1909 28.3234 27.6169 27.9703 27.9703C27.6169 28.3234 27.1909 28.5 26.6923 28.5H13.3077ZM21.3077 24.5C20.8091 24.5 20.3831 24.3234 20.0297 23.9703C19.6766 23.6169 19.5 23.1909 19.5 22.6923V17.3078C19.5 16.8091 19.6766 16.3831 20.0297 16.0298C20.3831 15.6766 20.8091 15.5 21.3077 15.5H27.6923C28.1909 15.5 28.6169 15.6766 28.9703 16.0298C29.3234 16.3831 29.5 16.8091 29.5 17.3078V22.6923C29.5 23.1909 29.3234 23.6169 28.9703 23.9703C28.6169 24.3234 28.1909 24.5 27.6923 24.5H21.3077ZM27.6923 23C27.7821 23 27.8558 22.9712 27.9135 22.9135C27.9712 22.8558 28 22.7821 28 22.6923V17.3078C28 17.2179 27.9712 17.1442 27.9135 17.0865C27.8558 17.0288 27.7821 17 27.6923 17H21.3077C21.2179 17 21.1442 17.0288 21.0865 17.0865C21.0288 17.1442 21 17.2179 21 17.3078V22.6923C21 22.7821 21.0288 22.8558 21.0865 22.9135C21.1442 22.9712 21.2179 23 21.3077 23H27.6923ZM25.0625 21.0625C25.3542 20.7708 25.5 20.4167 25.5 20C25.5 19.5833 25.3542 19.2292 25.0625 18.9375C24.7708 18.6458 24.4167 18.5 24 18.5C23.5833 18.5 23.2292 18.6458 22.9375 18.9375C22.6458 19.2292 22.5 19.5833 22.5 20C22.5 20.4167 22.6458 20.7708 22.9375 21.0625C23.2292 21.3542 23.5833 21.5 24 21.5C24.4167 21.5 24.7708 21.3542 25.0625 21.0625Z" fill="currentColor" />
  </svg>
);

const OutstandingIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="8 8 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.1923 10.75V9.25H22.8077V10.75H17.1923ZM16.7 28.8307C15.6692 28.3846 14.7679 27.7756 13.9963 27.0038C13.2244 26.2321 12.6154 25.3308 12.1693 24.3C11.7231 23.2692 11.5 22.1692 11.5 21C11.5 19.8308 11.7231 18.7308 12.1693 17.7C12.6154 16.6692 13.2244 15.7679 13.9963 14.9962C14.7679 14.2244 15.6692 13.6154 16.7 13.1693C17.7308 12.7231 18.8308 12.5 20 12.5C21.0013 12.5 21.9657 12.6699 22.8932 13.0098C23.8207 13.3494 24.682 13.8359 25.477 14.4693L26.723 13.2232L27.7768 14.277L26.5307 15.523C27.1641 16.318 27.6506 17.1793 27.9902 18.1068C28.3301 19.0343 28.5 19.9987 28.5 21C28.5 22.1692 28.2769 23.2692 27.8307 24.3C27.3846 25.3308 26.7756 26.2321 26.0038 27.0038C25.2321 27.7756 24.3308 28.3846 23.3 28.8307C22.2692 29.2769 21.1692 29.5 20 29.5C18.8308 29.5 17.7308 29.2769 16.7 28.8307ZM24.95 25.95C26.3167 24.5833 27 22.9333 27 21C27 19.0667 26.3167 17.4167 24.95 16.05C23.5833 14.6833 21.9333 14 20 14C18.0667 14 16.4167 14.6833 15.05 16.05C13.6833 17.4167 13 19.0667 13 21C13 22.9333 13.6833 24.5833 15.05 25.95C16.4167 27.3167 18.0667 28 20 28C21.9333 28 23.5833 27.3167 24.95 25.95ZM17.404 24.75H18.9037V17.25H17.404V24.75ZM21.0962 24.75H22.596V17.25H21.0962V24.75Z" fill="currentColor" />
  </svg>
);

const OpenDealsIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="8 8 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M19.7883 27.9712C19.887 27.9712 19.9873 27.9481 20.0893 27.902C20.1911 27.8558 20.2715 27.8032 20.3305 27.7442L28.3286 19.7462C28.5542 19.5206 28.7241 19.2795 28.8383 19.023C28.9523 18.7666 29.0093 18.4975 29.0093 18.2155C29.0093 17.9231 28.9523 17.6417 28.8383 17.3712C28.7241 17.1006 28.5542 16.8576 28.3286 16.6422L24.3285 12.6422C24.1132 12.4166 23.8799 12.2515 23.6285 12.147C23.3774 12.0426 23.1056 11.9905 22.8133 11.9905C22.5313 11.9905 22.2605 12.0426 22.0008 12.147C21.7411 12.2515 21.5017 12.4166 21.2825 12.6422L20.7093 13.2155L22.5593 15.0807C22.7836 15.2949 22.9494 15.5391 23.0565 15.8135C23.1635 16.0878 23.217 16.3724 23.217 16.6672C23.217 17.2776 23.0132 17.7866 22.6055 18.1942C22.1979 18.6019 21.6889 18.8057 21.0785 18.8057C20.7837 18.8057 20.4981 18.757 20.2218 18.6595C19.9456 18.5621 19.7005 18.4064 19.4863 18.1922L17.592 16.3135L13.246 20.6595C13.1704 20.7351 13.1136 20.8198 13.0758 20.9135C13.038 21.007 13.019 21.1031 13.019 21.202C13.019 21.3865 13.0819 21.5441 13.2075 21.675C13.3332 21.8058 13.4883 21.8712 13.6728 21.8712C13.7716 21.8712 13.872 21.8481 13.9738 21.802C14.0758 21.7558 14.1563 21.7032 14.2153 21.6442L17.4998 18.3597L18.5535 19.4135L15.2843 22.698C15.2088 22.7736 15.1521 22.8583 15.1143 22.952C15.0765 23.0455 15.0575 23.1416 15.0575 23.2405C15.0575 23.4186 15.122 23.5721 15.2508 23.701C15.3796 23.8298 15.5331 23.8942 15.7113 23.8942C15.8101 23.8942 15.9105 23.8711 16.0123 23.825C16.1143 23.7788 16.1947 23.7262 16.2535 23.6672L19.6535 20.2827L20.7075 21.3365L17.3228 24.7365C17.2536 24.7955 17.1985 24.8759 17.1575 24.9777C17.1165 25.0797 17.096 25.1801 17.096 25.2787C17.096 25.4571 17.1605 25.6106 17.2893 25.7395C17.4181 25.8683 17.5716 25.9327 17.7498 25.9327C17.8485 25.9327 17.9446 25.9138 18.0383 25.876C18.1318 25.8381 18.2164 25.7814 18.292 25.7057L21.692 22.3212L22.746 23.375L19.346 26.775C19.2704 26.8506 19.2136 26.9385 19.1758 27.0385C19.138 27.1385 19.119 27.2346 19.119 27.327C19.119 27.5115 19.1876 27.665 19.3248 27.7875C19.462 27.91 19.6165 27.9712 19.7883 27.9712ZM19.7728 29.471C19.2075 29.471 18.7145 29.2749 18.294 28.8827C17.8735 28.4904 17.6537 28.0019 17.6345 27.4172C17.0679 27.3787 16.5945 27.1775 16.2143 26.8135C15.8341 26.4493 15.628 25.9711 15.596 25.3787C15.0037 25.3404 14.5249 25.1334 14.1595 24.7577C13.794 24.3821 13.5985 23.9096 13.5728 23.3402C12.978 23.3019 12.487 23.0862 12.0998 22.6932C11.7126 22.3002 11.519 21.8031 11.519 21.202C11.519 20.9071 11.5751 20.6183 11.6873 20.3355C11.7995 20.0528 11.9626 19.8045 12.1768 19.5905L17.592 14.1905L20.521 17.1192C20.5799 17.1884 20.657 17.2436 20.7525 17.2847C20.8482 17.3257 20.9518 17.3462 21.0633 17.3462C21.2453 17.3462 21.4023 17.286 21.5343 17.1655C21.6665 17.045 21.7325 16.8872 21.7325 16.6922C21.7325 16.5807 21.712 16.4772 21.671 16.3817C21.6299 16.2862 21.5747 16.209 21.5055 16.15L17.9978 12.6422C17.7825 12.4166 17.5475 12.2515 17.293 12.147C17.0385 12.0426 16.7651 11.9905 16.4728 11.9905C16.1908 11.9905 15.9232 12.0426 15.67 12.147C15.4167 12.2515 15.1773 12.4166 14.9518 12.6422L11.667 15.9422C11.485 16.1242 11.336 16.3393 11.22 16.5875C11.104 16.8355 11.0358 17.0884 11.0153 17.3462C10.9946 17.5591 11.0042 17.7696 11.044 17.978C11.0837 18.1863 11.1535 18.3821 11.2535 18.5655L10.1498 19.6692C9.92413 19.3436 9.7543 18.9788 9.6403 18.575C9.52613 18.1711 9.4793 17.7616 9.4998 17.3462C9.5203 16.8859 9.62413 16.4413 9.8113 16.0125C9.99846 15.5836 10.2606 15.2006 10.5978 14.8635L13.8728 11.5885C14.2473 11.2243 14.6547 10.9503 15.095 10.7665C15.5354 10.5825 15.9979 10.4905 16.4825 10.4905C16.967 10.4905 17.4279 10.5825 17.865 10.7665C18.3024 10.9503 18.703 11.2243 19.067 11.5885L19.6403 12.1615L20.2133 11.5885C20.5876 11.2243 20.9934 10.9503 21.4305 10.7665C21.8677 10.5825 22.3286 10.4905 22.8133 10.4905C23.298 10.4905 23.7605 10.5825 24.2008 10.7665C24.6411 10.9503 25.0434 11.2243 25.4075 11.5885L29.3825 15.5635C29.7465 15.9276 30.0254 16.3421 30.219 16.8067C30.4125 17.2714 30.5093 17.7461 30.5093 18.2307C30.5093 18.7154 30.4125 19.1763 30.219 19.6135C30.0254 20.0506 29.7465 20.4512 29.3825 20.8152L21.3843 28.798C21.1638 29.0185 20.9155 29.1858 20.6393 29.3C20.363 29.414 20.0741 29.471 19.7728 29.471Z" fill="currentColor" />
  </svg>
);

const ClosedDealsIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="8 8 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10.7983 29.173L15.1828 16.904L23.0673 24.7885L10.7983 29.173ZM13.2713 26.7L20.3213 24.2L15.7713 19.65L13.2713 26.7ZM21.9828 20.7037L21.1443 19.8655L26.6288 14.3807C27.1302 13.8796 27.7366 13.629 28.4481 13.629C29.1596 13.629 29.766 13.8796 30.2673 14.3807L30.7518 14.8655L29.9328 15.7038L29.4481 15.2193C29.1763 14.9474 28.8462 14.8115 28.4578 14.8115C28.0693 14.8115 27.7392 14.9474 27.4673 15.2193L21.9828 20.7037ZM18.3288 17.05L17.4906 16.2115L18.0906 15.6115C18.3879 15.3142 18.5366 14.9539 18.5366 14.5307C18.5366 14.1077 18.3879 13.7475 18.0906 13.45L17.4596 12.8193L18.2981 11.9807L18.9288 12.6115C19.4622 13.1448 19.7288 13.7846 19.7288 14.5307C19.7288 15.2769 19.4622 15.9167 18.9288 16.45L18.3288 17.05ZM20.1558 18.877L19.3173 18.0385L22.8021 14.554C23.0738 14.2822 23.2096 13.952 23.2096 13.5635C23.2096 13.175 23.0738 12.8448 22.8021 12.573L21.3173 11.0885L22.1558 10.25L23.6403 11.7348C24.1482 12.2424 24.4021 12.852 24.4021 13.5635C24.4021 14.275 24.1482 14.8846 23.6403 15.3923L20.1558 18.877ZM23.8096 22.5308L22.9711 21.6923L24.1673 20.4963C24.707 19.9564 25.3583 19.6865 26.1211 19.6865C26.8839 19.6865 27.5353 19.9564 28.0751 20.4963L29.2711 21.6923L28.4326 22.5308L27.2366 21.3348C26.9328 21.0308 26.5609 20.8787 26.1211 20.8787C25.6814 20.8787 25.3097 21.0308 25.0058 21.3348L23.8096 22.5308Z" fill="currentColor" />
  </svg>
);

const UpcomingTasksIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="8 8 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 18H24.8077V16.5H20V18ZM20 23.5H24.8077V22H20V23.5ZM18.1433 18.3932C18.4579 18.0786 18.6152 17.6975 18.6152 17.25C18.6152 16.8027 18.4579 16.4216 18.1433 16.1068C17.8286 15.7921 17.4475 15.6348 17 15.6348C16.5525 15.6348 16.1714 15.7921 15.8568 16.1068C15.5421 16.4216 15.3848 16.8027 15.3848 17.25C15.3848 17.6975 15.5421 18.0786 15.8568 18.3932C16.1714 18.7079 16.5525 18.8652 17 18.8652C17.4475 18.8652 17.8286 18.7079 18.1433 18.3932ZM18.1433 23.8933C18.4579 23.5784 18.6152 23.1973 18.6152 22.75C18.6152 22.3025 18.4579 21.9214 18.1433 21.6067C17.8286 21.2921 17.4475 21.1348 17 21.1348C16.5525 21.1348 16.1714 21.2921 15.8568 21.6067C15.5421 21.9214 15.3848 22.3025 15.3848 22.75C15.3848 23.1973 15.5421 23.5784 15.8568 23.8933C16.1714 24.2079 16.5525 24.3652 17 24.3652C17.4475 24.3652 17.8286 24.2079 18.1433 23.8933ZM13.3077 28.5C12.8026 28.5 12.375 28.325 12.025 27.975C11.675 27.625 11.5 27.1974 11.5 26.6923V13.3077C11.5 12.8026 11.675 12.375 12.025 12.025C12.375 11.675 12.8026 11.5 13.3077 11.5H26.6923C27.1974 11.5 27.625 11.675 27.975 12.025C28.325 12.375 28.5 12.8026 28.5 13.3077V26.6923C28.5 27.1974 28.325 27.625 27.975 27.975C27.625 28.325 27.1974 28.5 26.6923 28.5H13.3077ZM13.3077 27H26.6923C26.7692 27 26.8398 26.9679 26.9038 26.9038C26.9679 26.8398 27 26.7692 27 26.6923V13.3077C27 13.2307 26.9679 13.1602 26.9038 13.0962C26.8398 13.0321 26.7692 13 26.6923 13H13.3077C13.2307 13 13.1603 13.0321 13.0963 13.0962C13.0321 13.1602 13 13.2307 13 13.3077V26.6923C13 26.7692 13.0321 26.8398 13.0963 26.9038C13.1603 26.9679 13.2307 27 13.3077 27Z" fill="currentColor" />
  </svg>
);

const UpcomingMeetingsIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="8 8 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 25.6345C18.9642 25.6345 17.9668 25.8124 17.0078 26.1683C16.0487 26.5241 15.1647 27.0642 14.3557 27.7885V27.9423C14.3814 27.9616 14.4071 27.976 14.4327 27.9855C14.4583 27.9952 14.4871 28 14.5192 28H25.4615C25.4937 28 25.5209 27.9952 25.5433 27.9855C25.5658 27.976 25.5898 27.9616 25.6155 27.9423V27.7885C24.8193 27.0642 23.9449 26.5241 22.9923 26.1683C22.0398 25.8124 21.0423 25.6345 20 25.6345ZM13 26.9848C13.9 26.1014 14.9458 25.4056 16.1375 24.8973C17.3292 24.3889 18.6167 24.1348 20 24.1348C21.3833 24.1348 22.6708 24.3889 23.8625 24.8973C25.0542 25.4056 26.1 26.1014 27 26.9848V14.3078C27 14.2308 26.9679 14.1603 26.9038 14.0963C26.8398 14.0321 26.7692 14 26.6923 14H13.3077C13.2307 14 13.1603 14.0321 13.0963 14.0963C13.0321 14.1603 13 14.2308 13 14.3078V26.9848ZM17.698 20.802C17.066 20.1698 16.75 19.4025 16.75 18.5C16.75 17.5975 17.066 16.8302 17.698 16.198C18.3302 15.566 19.0975 15.25 20 15.25C20.9025 15.25 21.6698 15.566 22.302 16.198C22.934 16.8302 23.25 17.5975 23.25 18.5C23.25 19.4025 22.934 20.1698 22.302 20.802C21.6698 21.434 20.9025 21.75 20 21.75C19.0975 21.75 18.3302 21.434 17.698 20.802ZM21.2355 19.7355C21.5785 19.3927 21.75 18.9808 21.75 18.5C21.75 18.0192 21.5785 17.6073 21.2355 17.2645C20.8927 16.9215 20.4808 16.75 20 16.75C19.5192 16.75 19.1073 16.9215 18.7645 17.2645C18.4215 17.6073 18.25 18.0192 18.25 18.5C18.25 18.9808 18.4215 19.3927 18.7645 19.7355C19.1073 20.0785 19.5192 20.25 20 20.25C20.4808 20.25 20.8927 20.0785 21.2355 19.7355ZM13.3077 29.5C12.8026 29.5 12.375 29.325 12.025 28.975C11.675 28.625 11.5 28.1974 11.5 27.6923V14.3078C11.5 13.8026 11.675 13.375 12.025 13.025C12.375 12.675 12.8026 12.5 13.3077 12.5H14.6923V10.3848H16.2308V12.5H23.8077V10.3848H25.3077V12.5H26.6923C27.1974 12.5 27.625 12.675 27.975 13.025C28.325 13.375 28.5 13.8026 28.5 14.3078V27.6923C28.5 28.1974 28.325 28.625 27.975 28.975C27.625 29.325 27.1974 29.5 26.6923 29.5H13.3077Z" fill="currentColor" />
  </svg>
);

const TotalInvoicedIcon = ({ size = 20 }) => (
  <svg width={size} height={size * (18 / 19)} viewBox="0 0 19 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14.126 8.126C14.2983 7.9535 14.3845 7.74483 14.3845 7.5C14.3845 7.25517 14.2983 7.0465 14.126 6.874C13.9535 6.70167 13.7448 6.6155 13.5 6.6155C13.2552 6.6155 13.0465 6.70167 12.874 6.874C12.7017 7.0465 12.6155 7.25517 12.6155 7.5C12.6155 7.74483 12.7017 7.9535 12.874 8.126C13.0465 8.29833 13.2552 8.3845 13.5 8.3845C13.7448 8.3845 13.9535 8.29833 14.126 8.126ZM5.5 6.25H10.5V4.75H5.5V6.25ZM2.375 18C1.84683 16.1768 1.319 14.3628 0.7915 12.5577C0.263833 10.7526 0 8.9 0 7C0 5.60767 0.48525 4.42625 1.45575 3.45575C2.42625 2.48525 3.60767 2 5 2H10.25C10.7077 1.39867 11.2568 0.915001 11.8973 0.549001C12.5376 0.183001 13.2385 0 14 0C14.2757 0 14.5113 0.0977495 14.7068 0.29325C14.9023 0.48875 15 0.724333 15 1C15 1.068 14.9907 1.13592 14.972 1.20375C14.9535 1.27175 14.934 1.33458 14.9135 1.39225C14.8212 1.63325 14.7426 1.88008 14.6777 2.13275C14.6131 2.38525 14.5577 2.64033 14.5115 2.898L17.1135 5.5H19V11.6095L16.271 12.5058L14.625 18H10V16H7V18H2.375ZM3.5 16.5H5.5V14.5H11.5V16.5H13.5L15.05 11.35L17.5 10.525V7H16.5L13 3.5C13 3.16667 13.0208 2.84583 13.0625 2.5375C13.1042 2.22917 13.1731 1.91983 13.2693 1.6095C12.7859 1.74283 12.3641 1.97525 12.0038 2.30675C11.6436 2.63808 11.3673 3.03583 11.175 3.5H5C4.03333 3.5 3.20833 3.84167 2.525 4.525C1.84167 5.20833 1.5 6.03333 1.5 7C1.5 8.63333 1.725 10.2292 2.175 11.7875C2.625 13.3458 3.06667 14.9167 3.5 16.5Z" fill="currentColor" />
  </svg>
);

const PendingOverdueIcon = ({ size = 20 }) => (
  <svg width={size * (15 / 19)} height={size} viewBox="0 0 15 19" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3.40375 17.5H11.5962V14.5C11.5962 13.3615 11.1982 12.3877 10.402 11.5787C9.60583 10.7697 8.6385 10.3652 7.5 10.3652C6.3615 10.3652 5.39417 10.7697 4.598 11.5787C3.80183 12.3877 3.40375 13.3615 3.40375 14.5V17.5ZM0 19V17.5H1.904V14.5C1.904 13.3743 2.212 12.3497 2.828 11.426C3.444 10.5022 4.26033 9.86017 5.277 9.5C4.26033 9.13333 3.444 8.48975 2.828 7.56925C2.212 6.64875 1.904 5.62567 1.904 4.5V1.5H0V0H15V1.5H13.096V4.5C13.096 5.62567 12.788 6.64875 12.172 7.56925C11.556 8.48975 10.7397 9.13333 9.723 9.5C10.7397 9.86017 11.556 10.5022 12.172 11.426C12.788 12.3497 13.096 13.3743 13.096 14.5V17.5H15V19H0Z" fill="currentColor" />
  </svg>
);

const CollectedIcon = ({ size = 20 }) => (
  <svg width={size * (21 / 23)} height={size} viewBox="0 0 21 23" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.98075 15.4423V7.94225H4.48075V15.4423H2.98075ZM8.48075 15.4423V7.94225H9.98075V15.4423H8.48075ZM0 5.94225V4.51925L9.23075 0L18.4615 4.51925V5.94225H0ZM3.5615 4.44225H14.9L9.23075 1.69225L3.5615 4.44225ZM0 18.9423V17.4423H11.5787C11.5992 17.7089 11.6282 17.9631 11.6655 18.2048C11.7027 18.4464 11.7552 18.6923 11.823 18.9423H0ZM13.9808 12.202V7.94225H15.4808V11.452L13.9808 12.202ZM17.2307 22.0575C16.1641 21.7935 15.282 21.1823 14.5845 20.224C13.8872 19.2657 13.5385 18.2013 13.5385 17.0308V14.673L17.2307 12.827L20.923 14.673V17.0308C20.923 18.2013 20.5743 19.2657 19.877 20.224C19.1795 21.1823 18.2974 21.7935 17.2307 22.0575ZM16.5058 19.2307L19.7595 15.9923L18.9212 15.1538L16.5058 17.5385L15.5307 16.5635L14.6923 17.4172L16.5058 19.2307Z" fill="currentColor" />
  </svg>
);

const CompanyProfilePage = () => {
  const { id } = useParams(); // company ID
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // The list of company ids the user was browsing (whatever search/filter was
  // active on the Companies page) when they clicked into this company — lets
  // the prev/next arrows step through that same set instead of every company.
  // The prev/next list arrives in location.state from whichever list you
  // came from. Switching tabs calls setSearchParams(), which writes a new
  // history entry and drops that state unless it's passed along — which is
  // why the arrows vanished the moment you left Overview. The ref keeps the
  // last list seen so any other state-dropping navigation can't lose it
  // either; only a full page load legitimately clears it.
  const companyIdsRef = useRef(null);
  if (location.state?.companyIds) companyIdsRef.current = location.state.companyIds;
  const companyIds = location.state?.companyIds || companyIdsRef.current || null;
  const companyIdsIndex = companyIds ? companyIds.indexOf(id) : -1;
  const prevCompanyId =
    companyIdsIndex > 0 ? companyIds[companyIdsIndex - 1] : null;
  const nextCompanyId =
    companyIdsIndex !== -1 && companyIdsIndex < companyIds?.length - 1
      ? companyIds[companyIdsIndex + 1]
      : null;
  const goToCompany = (companyId) => {
    if (!companyId) return;
    // Preserve the current tab across prev/next — without this, arrowing
    // through companies while on e.g. Folders silently dropped back to
    // Overview on every navigation.
    navigate(`/companies/${companyId}?tab=${encodeURIComponent(activeTab)}`, { state: { companyIds } });
  };
  const [company, setCompany] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [folders, setFolders] = useState([]);
  const [callLogs, setCallLogs] = useState([]);
  const tabFromUrl = searchParams.get("tab");
  const [activeTab, setActiveTabState] = useState(
    tabs.includes(tabFromUrl) ? tabFromUrl : "Overview",
  );
  const setActiveTab = (tab) => {
    setActiveTabState(tab);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", tab);
        return next;
      },
      // Carry location.state across: without it the new entry has no state
      // and the prev/next company arrows disappear.
      { replace: true, state: location.state }
    );
  };

  // Sliding pill indicator for the section-switcher tab bar
  const tabRefs = useRef({});
  const tabTrackRef = useRef(null);
  const [tabIndicator, setTabIndicator] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const el = tabRefs.current[activeTab];
      if (el) setTabIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    // A refresh that deep-links straight into a non-default tab (e.g.
    // ?tab=Meetings) mounts this row while the header above is still
    // showing loading skeletons. Skeleton-to-real-content swaps change tab
    // button widths without activeTab changing, so a ResizeObserver on the
    // whole track re-measures whenever ANY tab's size shifts — not just on
    // tab switches — keeping the pill glued to the right button instead of
    // stranding it wherever it first measured.
    const ro = new ResizeObserver(measure);
    if (tabTrackRef.current) ro.observe(tabTrackRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [activeTab]);

  const [invoices, setInvoices] = useState([]);
  const [invoiceSummary, setInvoiceSummary] = useState(null);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesLoaded, setInvoicesLoaded] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [showNewEntryMenu, setShowNewEntryMenu] = useState(false);
  // Which tab's "add" form the New Entry menu should auto-open once its tab
  // mounts. Cleared by the tab itself after it consumes the trigger, so
  // switching tabs manually afterwards doesn't reopen the form.
  const [pendingCreate, setPendingCreate] = useState(null);
  const [showStats, setShowStats] = useState(true);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [dealsViewMode, setDealsViewMode] = useState("list");
  const [activityFeedFilter, setActivityFeedFilter] = useState("All");
  const newEntryRef = useRef(null);
  const actionsMenuRef = useRef(null);
  const [showLastUpdatedTooltip, setShowLastUpdatedTooltip] = useState(false);
  const formatDateTime = (value) => {
    if (!value) return "—";
    return new Date(value).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };
  const incomeChartScrollRef = useRef(null);

  const chartDotCursorSvg = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><g filter="url(#filter0_dd_2154_683)"><rect x="4" y="2" width="12" height="12" rx="6" fill="white"/><rect x="5" y="3" width="10" height="10" rx="5" stroke="#0F0E0E" stroke-width="2"/></g><defs><filter id="filter0_dd_2154_683" x="0" y="0" width="20" height="20" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/><feOffset dy="2"/><feGaussianBlur stdDeviation="2"/><feColorMatrix type="matrix" values="0 0 0 0 0.196487 0 0 0 0 0.196487 0 0 0 0 0.279476 0 0 0 0.06 0"/><feBlend mode="multiply" in2="BackgroundImageFix" result="effect1_dropShadow_2154_683"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/><feOffset dy="2"/><feGaussianBlur stdDeviation="1"/><feColorMatrix type="matrix" values="0 0 0 0 0.196487 0 0 0 0 0.196487 0 0 0 0 0.279476 0 0 0 0.06 0"/><feBlend mode="multiply" in2="effect1_dropShadow_2154_683" result="effect2_dropShadow_2154_683"/><feBlend mode="normal" in="SourceGraphic" in2="effect2_dropShadow_2154_683" result="shape"/></filter></defs></svg>`;
  const chartDotCursor = `url("data:image/svg+xml,${encodeURIComponent(chartDotCursorSvg)}") 10 10, auto`;

  const [showSubsidiaryModal, setShowSubsidiaryModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [parentCompany, setParentCompany] = useState(null);
  const [childCompanies, setChildCompanies] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  useEffect(() => {
    try {
      const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
      setIsAdmin(storedUser?.role === "admin");
      setCurrentUserId(storedUser?._id || null);
    } catch {
      setIsAdmin(false);
      setCurrentUserId(null);
    }
  }, []);

  const isCompanyOwner =
    !!currentUserId &&
    !!company?.owner &&
    (company.owner._id || company.owner) === currentUserId;
  const canManageChildCompany = isAdmin || isCompanyOwner;

  const [showForm, setShowForm] = useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [companyFieldNames, setCompanyFieldNames] = useState([]);
  const [additionalFields, setAdditionalFields] = useState({});
  const [form, setForm] = useState({
    name: "",
    industry: "",
    address: "",
    website: "",
    gstin: "",
    profilePicture: null,
    profilePictureUrl: "",
  });

  const openDealsCount = deals.filter((d) => d.status === "Open").length;
  const closedDealsCount = deals.filter(
    (d) => d.status === "Won" || d.status === "Lost",
  ).length;
  const upcomingTasksCount = tasks.filter(
    (t) => t.status !== "Completed"
  ).length;
  const upcomingMeetingsCount = meetings.filter(
    (m) => m.scheduledAt && new Date(m.scheduledAt) >= new Date(),
  ).length;

  const statTiles = [
    {
      label: "Lifetime Revenue",
      value: `₹${(invoiceSummary?.totalAmount || 0).toLocaleString("en-IN")}`,
      icon: LifetimeRevenueIcon,
    },
    {
      label: "Outstanding",
      value: `₹${(invoiceSummary?.amountDue || 0).toLocaleString("en-IN")}`,
      icon: OutstandingIcon,
    },
    { label: "Open Deals", value: openDealsCount, icon: OpenDealsIcon },
    { label: "Closed Deals", value: closedDealsCount, icon: ClosedDealsIcon },
    { label: "Upcoming Tasks", value: upcomingTasksCount, icon: UpcomingTasksIcon },
    {
      label: "Upcoming Meetings",
      value: upcomingMeetingsCount,
      icon: UpcomingMeetingsIcon,
    },
  ];

  // Deal stages: the data model only tracks Open/Won/Lost (no Lead/Qualified/
  // Negotiation sub-stages), so the pipeline funnel reflects that.
  const pipelineStages = [
    { key: "Open", label: "Open", color: "bg-[#FDF3E6] text-[#EA9927]" },
    { key: "Won", label: "Won", color: "bg-[#E6F7EF] text-[#1FA971]" },
    { key: "Lost", label: "Lost", color: "bg-[#FCEAEA] text-[#EA4B4B]" },
  ];
  const pipelineData = pipelineStages.map((stage) => {
    const stageDeals = deals.filter(
      (d) => (d.status || "Open") === stage.key,
    );
    const amount = stageDeals.reduce((sum, d) => sum + (d.amount || 0), 0);
    return { ...stage, count: stageDeals.length, amount };
  });

  const financialTiles = [
    {
      label: "Total Invoiced",
      value: `₹${(invoiceSummary?.totalAmount || 0).toLocaleString("en-IN")}`,
      icon: TotalInvoicedIcon,
    },
    {
      label: "Pending",
      value: `₹${(invoiceSummary?.amountDue || 0).toLocaleString("en-IN")}`,
      icon: PendingOverdueIcon,
    },
    {
      label: "Overdue",
      value: `₹${(invoiceSummary?.overdueAmount || 0).toLocaleString("en-IN")}`,
      icon: PendingOverdueIcon,
      valueClassName: "text-red-600",
    },
    {
      label: "Collected",
      value: `₹${(invoiceSummary?.amountPaid || 0).toLocaleString("en-IN")}`,
      icon: CollectedIcon,
      valueClassName: "text-green-600",
    },
  ];

  // Bucket invoice amounts by month for the last 6 months (oldest to newest).
  const monthlyIncomeData = (() => {
    const buckets = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        month: d.toLocaleDateString("en-US", { month: "short" }),
        income: 0,
      });
    }
    invoices.forEach((invoice) => {
      const invoiceDate = invoice.date || invoice.createdAt;
      if (!invoiceDate) return;
      const d = new Date(invoiceDate);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const bucket = buckets.find((b) => b.key === key);
      if (!bucket) return;
      bucket.income += invoice.amount || 0;
      const status = invoice.status?.toLowerCase();
      if (status === "paid" || status === "accepted") bucket.hasPayment = true;
    });
    buckets.forEach((b) => {
      b.paidHighlight = b.hasPayment ? b.income : null;
    });
    return buckets;
  })();

  // Draws the highlight as a "tent" that hugs the line's actual slope (interpolated
  // from the neighboring points) instead of a flat-topped rectangle that pokes out
  // past the diagonal line on either side.
  const renderHighlightShape = (props) => {
    const { x, y, width, height, payload, background } = props;
    if (payload?.paidHighlight == null || !height) return null;

    const idx = monthlyIncomeData.findIndex((d) => d.key === payload.key);
    const prev = monthlyIncomeData[idx - 1];
    const next = monthlyIncomeData[idx + 1];
    const current = payload.income || 0;
    const pixelPerUnit = current > 0 ? height / current : 0;
    const baseline = y + height;

    // Bar is 40% of the category band, centered on it. Its edges sit inside the
    // band (not at the true inter-category midpoint), so interpolate the line's
    // value at that exact fraction of the distance to each neighbor's center —
    // a plain 50/50 average would only be correct if the bar spanned the full band.
    const bandX = background?.x ?? x;
    const bandWidth = background?.width ?? width;
    // The last bucket is the current, still-in-progress month — render it at
    // half the usual width so it reads as ongoing rather than a full column.
    const isOngoing = idx === monthlyIncomeData.length - 1;
    const barWidth = bandWidth * (isOngoing ? 0.2 : 0.4);
    const barX = bandX + (bandWidth - barWidth) / 2;
    const edgeFraction = barWidth / 2 / bandWidth;

    const leftValue = prev ? current + (prev.income - current) * edgeFraction : current;
    const rightValue = next ? current + (next.income - current) * edgeFraction : current;

    const leftY = baseline - leftValue * pixelPerUnit;
    const rightY = baseline - rightValue * pixelPerUnit;

    const points = `${barX},${leftY} ${barX + barWidth / 2},${y} ${barX + barWidth},${rightY} ${barX + barWidth},${baseline} ${barX},${baseline}`;
    return (
      <g>
        <polygon points={points} fill="#FFFFFF" />
        <polygon points={points} fill="url(#hoverGradient)" />
      </g>
    );
  };

  // Shared Y-axis domain so the fixed axis and the scrollable plot stay numerically in sync.
  const incomeYMax = (() => {
    const max = Math.max(0, ...monthlyIncomeData.map((b) => b.income));
    if (max === 0) return 100;
    const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
    return Math.ceil(max / magnitude) * magnitude;
  })();

  // Unified activity feed merged from deals/invoices/tasks/meetings — this app has no
  // dedicated activity-log collection, so we synthesize one from each source's own dates.
  const activityFeedItems = (() => {
    const items = [];

    invoices.forEach((invoice) => {
      const isOverdue =
        invoice.status !== "Paid" &&
        invoice.dueDate &&
        new Date(invoice.dueDate) < new Date();
      items.push({
        type: "Invoices",
        icon: Receipt,
        iconClass: isOverdue
          ? "bg-red-50 text-red-600"
          : "bg-blue-50 text-blue-600",
        title: isOverdue
          ? `Invoice #${invoice.invoiceNumber || invoice._id} is overdue`
          : `Invoice #${invoice.invoiceNumber || invoice._id} created`,
        subtitle: null,
        amount: invoice.amount,
        amountClass: isOverdue ? "text-red-600" : "text-gray-900",
        date: new Date(invoice.dueDate || invoice.createdAt || invoice.date),
      });
    });

    deals.forEach((deal) => {
      items.push({
        type: "Deals",
        icon: BriefcaseBusiness,
        iconClass:
          deal.status === "Won"
            ? "bg-green-50 text-green-600"
            : deal.status === "Lost"
              ? "bg-red-50 text-red-600"
              : "bg-blue-50 text-blue-600",
        title:
          deal.status === "Won"
            ? `Deal Won: ${deal.title}`
            : deal.status === "Lost"
              ? `Deal Lost: ${deal.title}`
              : `Deal Created: ${deal.title}`,
        subtitle: null,
        amount: deal.amount,
        amountClass: "text-gray-900",
        date: new Date(deal.updatedAt || deal.createdAt),
      });
    });

    tasks.forEach((task) => {
      items.push({
        type: "Tasks",
        icon: CheckSquare,
        iconClass:
          task.status === "Completed"
            ? "bg-green-50 text-green-600"
            : "bg-blue-50 text-blue-600",
        title:
          task.status === "Completed"
            ? `Task Completed: ${task.title}`
            : `Task Scheduled: ${task.title}`,
        subtitle: null,
        amount: null,
        date: new Date(task.dueDate || task.createdAt),
      });
    });

    meetings.forEach((meeting) => {
      const isPast = meeting.scheduledAt && new Date(meeting.scheduledAt) < new Date();
      items.push({
        type: "Meetings",
        icon: TeamIcon,
        iconClass: isPast
          ? "bg-green-50 text-green-600"
          : "bg-blue-50 text-blue-600",
        title: isPast
          ? `Meeting Completed: ${meeting.title}`
          : `Meeting Scheduled: ${meeting.title}`,
        subtitle: null,
        amount: null,
        date: new Date(meeting.scheduledAt || meeting.createdAt),
      });
    });

    callLogs.forEach((call) => {
      items.push({
        type: "Call Logs",
        icon: CellphoneIcon,
        iconClass: "bg-green-50 text-green-600",
        title: `Logged Call: ${call.purpose || "Phone Call"}`,
        subtitle: call.notes || null,
        amount: null,
        date: new Date(call.timestamp || call.createdAt),
      });
    });

    return items
      .filter((item) => !isNaN(item.date))
      .sort((a, b) => b.date - a.date)
      .slice(0, 8);
  })();

  const activityFeedTabs = ["All", "Deals", "Invoices", "Tasks", "Call Logs", "Meetings"];
  const filteredActivityFeed =
    activityFeedFilter === "All"
      ? activityFeedItems
      : activityFeedItems.filter((item) => item.type === activityFeedFilter);

  // Mini calendar grid for the current month
  const miniCalendar = (() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const adjustedFirstDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

    const days = [];
    for (let i = 0; i < adjustedFirstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);

    return { year, month, today: today.getDate(), days };
  })();

  const futureEventDays = new Set(
    [...tasks, ...meetings]
      .map((item) => new Date(item.dueDate || item.scheduledAt))
      .filter(
        (d) =>
          !isNaN(d) &&
          d.getFullYear() === miniCalendar.year &&
          d.getMonth() === miniCalendar.month &&
          d.getDate() > miniCalendar.today
      )
      .map((d) => d.getDate())
  );

  const upcomingItems = [...tasks, ...meetings]
    .map((item) => ({
      title: item.title,
      date: new Date(item.dueDate || item.scheduledAt),
      overdue:
        item.status !== "Completed" &&
        (item.dueDate || item.scheduledAt) &&
        new Date(item.dueDate || item.scheduledAt) < new Date(),
      isMeeting: !!item.scheduledAt,
    }))
    .filter((item) => !isNaN(item.date))
    .sort((a, b) => a.date - b.date)
    .slice(0, 4);

  const keyFiles = folders
    .flatMap((folder) => folder.files || [])
    .sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0))
    .slice(0, 5);

  const upcomingTasksList = tasks
    .filter((t) => t.status !== "Completed")
    .sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0))
    .slice(0, 5);

  const upcomingMeetingsList = meetings
    .filter((m) => m.scheduledAt && new Date(m.scheduledAt) >= new Date())
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
    .slice(0, 5);

  // "Due Today, 11:10 AM" / "Tomorrow, 11:00 AM" style label for a date+time
  const relativeDayTimeLabel = (date, prefix = "") => {
    if (!date) return "No due date";
    const d = new Date(date);
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const dayLabel =
      d.toDateString() === now.toDateString()
        ? `${prefix}Today`
        : d.toDateString() === tomorrow.toDateString()
          ? "Tomorrow"
          : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const time = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${dayLabel}, ${time}`;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // SEPARATED FETCH FUNCTION SO WE CAN REFRESH AFTER EDITING
  const fetchCompanyDetails = async () => {
    try {
      const resCompany = await API.get(`/companies/${id}`);
      setCompany(resCompany.data);
    } catch (err) {
      console.error("Failed to load company profile:", err);
      toast.error("Failed to load company profile.");
    }
  };

  useEffect(() => {
    // Reset so switching companies (e.g. via the prev/next arrows) shows the
    // skeleton again instead of leaving the previous company's data on
    // screen until the new fetch resolves.
    setDataLoaded(false);
    setInvoicesLoaded(false);

    const fetchData = async () => {
      try {
        await fetchCompanyDetails();
        const resSubsidiaries = await API.get(`/companies/${id}/subsidiaries`);
        const subsidiaryIds = resSubsidiaries.data.map((sub) => sub._id);
        setChildCompanies(resSubsidiaries.data || []);
        API.get(`/companies/${id}/parent`)
          .then((res) => setParentCompany(res.data || null))
          .catch(() => setParentCompany(null));
        const resContacts = await API.get("/contacts");
        const resDeals = await API.get("/deals");
        const resMeetings = await API.get("/meetings", { params: { companyId: id } });
        const resTasks = await API.get(`/tasks/company/${id}`);
        const resFields = await API.get("/company-fields");
        const resFolders = await API.get("/folders", { params: { companyId: id } });
        const resCallLogs = await API.get(`/call-logs/company/${id}`).catch(() => ({ data: [] }));

        setContacts(
          resContacts.data.filter(
            (c) =>
              c.company?._id === id || subsidiaryIds.includes(c.company?._id),
          ),
        );
        setDeals(resDeals.data.filter((d) => d.company?._id === id));
        setMeetings(resMeetings.data.meetings);
        setTasks(resTasks.data || []);
        setFolders(resFolders.data || []);
        setCallLogs(resCallLogs.data || []);
        if (resFields.data) {
          setCompanyFieldNames(resFields.data.fields || []);
        }
      } catch (err) {
        console.error("Failed to load company profile:", err);
        toast.error("Failed to load company profile.");
      } finally {
        setDataLoaded(true);
      }
    };

    fetchData();
  }, [id]);

  // Overview renders invoice-derived tiles alongside deal/task data, so it
  // legitimately has to wait for both fetches.
  const showOverviewSkeleton = !dataLoaded || !invoicesLoaded;
  // Everything that comes out of the single fetchData batch — contacts, deals,
  // meetings, tasks, folders. Deliberately NOT gated on invoicesLoaded: those
  // tabs don't render invoice data, so waiting on that request would leave
  // their skeletons up long after their own data had arrived.
  const showRecordsSkeleton = !dataLoaded;

  useTopLoadingSignal(showOverviewSkeleton || showRecordsSkeleton);

  const fetchInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    try {
      const res = await API.get(`/invoices/company/${id}`);
      setInvoices(res.data.invoices || []);
      setInvoiceSummary(res.data.summary || null);
      setInvoicesLoaded(true);
    } catch (err) {
      console.error("Failed to load invoices:", err);
    } finally {
      setInvoicesLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (newEntryRef.current && !newEntryRef.current.contains(event.target)) {
        setShowNewEntryMenu(false);
      }
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target)) {
        setShowActionsMenu(false);
      }
    };
    // Scroll closes both menus outright rather than tracking their
    // position — same reasoning as Accounting.jsx's convert menu.
    const handleScroll = () => {
      setShowNewEntryMenu(false);
      setShowActionsMenu(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, []);

  // Open the income chart already scrolled to the current month, not the oldest one.
  useEffect(() => {
    if (invoicesLoaded && incomeChartScrollRef.current) {
      incomeChartScrollRef.current.scrollLeft = incomeChartScrollRef.current.scrollWidth;
    }
  }, [invoicesLoaded]);

  const handleEdit = () => {
    // Edit via the shared QuickCompanyForm (same as create).
    setShowForm(true);
  };

  // Helper function to check if social media link exists
  const hasSocialLink = (platform) => {
    return company?.socialMedia?.[platform] && company.socialMedia[platform].trim() !== '';
  };

  // Helper function to open social media link
  const openSocialLink = (platform) => {
    const urlOrNumber = company?.socialMedia?.[platform];
    if (urlOrNumber && urlOrNumber.trim() !== '') {
      if (platform === 'whatsapp') {
        // Strip out non-numeric characters (except '+') for the WhatsApp API
        const cleanNumber = urlOrNumber.replace(/[^\d+]/g, '');
        const senderName = JSON.parse(localStorage.getItem('user') || '{}').name || '';
        const opener = `Hello ${company?.companyName || company?.name || ''}, this is ${senderName}.`.replace(/\s+/g, ' ').trim();
        window.open(`https://wa.me/${cleanNumber}?text=${encodeURIComponent(opener)}`, '_blank', 'noopener,noreferrer');
      } else {
        window.open(urlOrNumber, '_blank', 'noopener,noreferrer');
      }
    }
  };

  return (
    <div className="min-h-screen bg-white -mt-6 -mx-4 sm:-mx-6 lg:-mx-8 pt-6 px-6">
      <style>{`.income-chart-scroll::-webkit-scrollbar { display: none; }`}</style>
      {showForm && (
        <QuickCompanyForm
          editCompany={company}
          onCompanyUpdated={() => {
            fetchCompanyDetails();
            setShowForm(false);
          }}
          onRequestClose={() => setShowForm(false)}
        />
      )}

      <div className="mx-auto">
        {/* Header Section */}
        {/* 48px total (40px content + mb-2) so the strip's bottom edge lands
            on y=128 — the same line as the bottom border of the sidebar's
            switcher section (Navbar.jsx: a 64px logo block then a 64px
            `h-16 ... border-b` switcher, both inside a `fixed top-0` rail).
            Detail pages start at y=80 (<main> carries lg:pt-20), so they need
            48px here, unlike the list pages whose band is `fixed top-16 h-16`
            and therefore 64px. */}
        <div className="flex items-center justify-between mb-2">
          {/* LEFT: Logo + Name + Address */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Prev/next through whatever company list (search/filter results)
                the user arrived from — absent on a direct link, so nothing
                renders and there's no "browse everything" fallback. */}
            {companyIds && (
              <button
                type="button"
                onClick={() => goToCompany(prevCompanyId)}
                disabled={!prevCompanyId}
                title="Previous company"
                aria-label="Previous company"
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            {/* Logo using ProfilePicture component */}
            {company ? (
              <ProfilePicture
                contact={{
                  name: company.name,
                  avatar: company.profilePicture,
                }}
                size="w-9 h-9"
                textSize="text-sm"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
            )}

            {/* Title + Address */}
            <div className="min-w-0">
              {company ? (
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-base font-semibold text-gray-900 truncate">
                    {company.name}
                  </h1>
                  {parentCompany && (
                    <Link
                      to={`/companies/${parentCompany._id}`}
                      className="flex-shrink-0 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5 hover:bg-blue-100 transition-colors truncate max-w-[160px]"
                      title={`Child company of ${parentCompany.name}`}
                    >
                      Child company of {parentCompany.name}
                    </Link>
                  )}
                </div>
              ) : (
                <Skeleton width={140} height={16} className="mb-1" />
              )}
              {company ? (
                company.address && (
                  // No mt here: the 2px gap pushed this stacked block past
                  // the bottom border of the sidebar's switcher section
                  // (Navbar.jsx renders that as `h-16 ... border-b`), so the
                  // strip sat a couple of pixels below that line.
                  <p className="text-xs text-gray-500 truncate">
                    {company.address}
                  </p>
                )
              ) : (
                <Skeleton width={100} height={11} />
              )}
            </div>
            {companyIds && (
              <button
                type="button"
                onClick={() => goToCompany(nextCompanyId)}
                disabled={!nextCompanyId}
                title="Next company"
                aria-label="Next company"
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* RIGHT: Social Icons (desktop only here — shown below the name on mobile) + Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Owner — the org User (staff/admin) designated as this
                company's owner (Company.owner, set from the Companies
                list's row menu, admin-only). Not a CRM contact, so this is
                just a label, not a link to a profile page. */}
            {company?.owner ? (
              <button
                disabled
                title={`Owner: ${company.owner.name}`}
                className="hidden lg:flex w-8 h-8 items-center justify-center rounded-full border border-gray-200 text-gray-800"
              >
                <User size={16} strokeWidth={2} />
              </button>
            ) : (
              <button
                disabled
                title="No owner assigned — set one from the Companies list"
                className="hidden lg:flex w-8 h-8 items-center justify-center rounded-full border border-gray-200 text-gray-300 cursor-not-allowed"
              >
                <User size={16} strokeWidth={2} />
              </button>
            )}

            {/* Last updated / created — hover for a small popover with both
                timestamps instead of a single-line native tooltip. */}
            <div
              className="relative hidden lg:block"
              onMouseEnter={() => setShowLastUpdatedTooltip(true)}
              onMouseLeave={() => setShowLastUpdatedTooltip(false)}
            >
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-800 hover:bg-gray-50 transition-colors"
              >
                <Clock size={16} strokeWidth={2} />
              </button>
              {showLastUpdatedTooltip && company && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-50 text-left">
                  <div className="mb-2">
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Last updated</p>
                    <p className="text-xs text-gray-800 mt-0.5">
                      {formatDateTime(company.updatedAt)}
                      {company.lastUpdatedBy?.name ? ` by ${company.lastUpdatedBy.name}` : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Created on</p>
                    <p className="text-xs text-gray-800 mt-0.5">
                      {formatDateTime(company.createdAt)}
                      {company.createdBy?.name ? ` by ${company.createdBy.name}` : ""}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Twitter/X */}
            <button
              disabled={!hasSocialLink("twitter")}
              className={`hidden lg:flex w-8 h-8 items-center justify-center rounded-full border transition-colors ${hasSocialLink("twitter")
                ? "border-gray-200 text-gray-800 hover:bg-gray-50 cursor-pointer"
                : "border-gray-200 text-gray-300 cursor-not-allowed"
                }`}
              onClick={() => openSocialLink("twitter")}
              title={
                hasSocialLink("twitter")
                  ? "View Twitter/X profile"
                  : "No Twitter/X link available"
              }
            >
              <Twitter size={16} strokeWidth={2} />
            </button>

            {/* LinkedIn */}
            <button
              disabled={!hasSocialLink("linkedin")}
              className={`hidden lg:flex w-8 h-8 items-center justify-center rounded-full border transition-colors ${hasSocialLink("linkedin")
                ? "border-gray-200 text-gray-800 hover:bg-gray-50 cursor-pointer"
                : "border-gray-200 text-gray-300 cursor-not-allowed"
                }`}
              onClick={() => openSocialLink("linkedin")}
              title={
                hasSocialLink("linkedin")
                  ? "View LinkedIn profile"
                  : "No LinkedIn link available"
              }
            >
              <Linkedin size={16} strokeWidth={2} />
            </button>

            {/* Instagram — maps to the company's "facebook" social field (no dedicated
                instagram field exists in the schema yet) */}
            <button
              disabled={!hasSocialLink("facebook")}
              className={`hidden lg:flex w-8 h-8 items-center justify-center rounded-full border transition-colors ${hasSocialLink("facebook")
                ? "border-gray-200 text-gray-800 hover:bg-gray-50 cursor-pointer"
                : "border-gray-200 text-gray-300 cursor-not-allowed"
                }`}
              onClick={() => openSocialLink("facebook")}
              title={
                hasSocialLink("facebook")
                  ? "View Instagram profile"
                  : "No Instagram link available"
              }
            >
              <Instagram size={16} strokeWidth={2} />
            </button>

            {/* Actions Menu */}
            <div className="relative" ref={actionsMenuRef}>
              <button
                onClick={() => setShowActionsMenu((prev) => !prev)}
                title="More actions"
                className={`w-8 h-8 flex items-center justify-center rounded-full border transition-colors ${showActionsMenu
                  ? "bg-gray-50 border-gray-200 text-gray-800"
                  : "bg-white border-gray-200 text-gray-800 hover:bg-gray-50"
                  }`}
              >
                <MoreIcon className="w-4 h-4" />
              </button>
              {showActionsMenu && (
                <div className="absolute right-0 mt-1 w-32 lg:w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                  <button
                    onClick={() => {
                      setShowStats((prev) => !prev);
                      setShowActionsMenu(false);
                    }}
                    className="flex items-center gap-1.5 lg:gap-2 w-full px-2 lg:px-3 py-1.5 lg:py-2 text-xs lg:text-sm font-normal text-gray-700 hover:bg-gray-50 text-left"
                  >
                    <EyeIcon size={12} className="text-gray-400 lg:hidden" />
                    <EyeIcon size={14} className="text-gray-400 hidden lg:block" />
                    {showStats ? "Hide KPIs" : "Unhide KPIs"}
                  </button>
                  {activeTab === "Deals" && (
                    <button
                      onClick={() => {
                        setDealsViewMode((prev) => (prev === "board" ? "list" : "board"));
                        setShowActionsMenu(false);
                      }}
                      className="flex items-center gap-1.5 lg:gap-2 w-full px-2 lg:px-3 py-1.5 lg:py-2 text-xs lg:text-sm font-normal text-gray-700 hover:bg-gray-50 text-left"
                    >
                      <LayoutGrid size={12} className="text-gray-400 lg:hidden" />
                      <LayoutGrid size={14} className="text-gray-400 hidden lg:block" />
                      {dealsViewMode === "board" ? "List View" : "Kanban View"}
                    </button>
                  )}
                  {/* Edit: mobile-only entry, folded in here instead of its own button */}
                  <button
                    onClick={() => {
                      handleEdit();
                      setShowActionsMenu(false);
                    }}
                    className="lg:hidden flex items-center gap-1.5 w-full px-2 py-1.5 text-xs font-normal text-gray-700 hover:bg-gray-50 text-left"
                  >
                    <EditIcon size={12} className="text-gray-400" />
                    Edit
                  </button>
                  {canManageChildCompany && !parentCompany && (
                    <button
                      onClick={() => {
                        setShowSubsidiaryModal(true);
                        setShowActionsMenu(false);
                      }}
                      className="flex items-center gap-1.5 lg:gap-2 w-full px-2 lg:px-3 py-1.5 lg:py-2 text-xs lg:text-sm font-normal text-gray-700 hover:bg-gray-50 text-left"
                    >
                      <Building2 size={12} className="text-gray-400 lg:hidden" />
                      <Building2 size={14} className="text-gray-400 hidden lg:block" />
                      Add Child Company
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* New Entry Dropdown — icon-only (+) on mobile */}
            <div className="relative" ref={newEntryRef}>
              <button
                onClick={() => setShowNewEntryMenu((prev) => !prev)}
                title="New Entry"
                className="flex items-center justify-center gap-1.5 h-8 w-8 lg:w-auto px-0 lg:px-4 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-full transition-colors"
              >
                <PlusIcon className="w-4 h-4 lg:hidden" />
                <span className="hidden lg:inline">New Entry</span>
                <ChevronDown size={14} className="hidden lg:inline" />
              </button>
              {showNewEntryMenu && (
                <div className="absolute right-0 mt-1 w-32 lg:w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                  {newEntryOptions.map((option) =>
                    option.tab ? (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => {
                          setActiveTab(option.tab);
                          setPendingCreate(option.create);
                          setShowNewEntryMenu(false);
                        }}
                        className="flex items-center gap-1.5 lg:gap-2 w-full px-2 lg:px-3 py-1.5 lg:py-2 text-xs lg:text-sm font-normal text-gray-700 hover:bg-gray-50 text-left"
                      >
                        <option.icon style={{ width: 12, height: 12 }} className="text-gray-400 lg:hidden" />
                        <option.icon style={{ width: 14, height: 14 }} className="text-gray-400 hidden lg:block" />
                        {option.label}
                      </button>
                    ) : (
                      <Link
                        key={option.label}
                        to={option.href}
                        onClick={() => setShowNewEntryMenu(false)}
                        className="flex items-center gap-1.5 lg:gap-2 px-2 lg:px-3 py-1.5 lg:py-2 text-xs lg:text-sm font-normal text-gray-700 hover:bg-gray-50"
                      >
                        <option.icon style={{ width: 12, height: 12 }} className="text-gray-400 lg:hidden" />
                        <option.icon style={{ width: 14, height: 14 }} className="text-gray-400 hidden lg:block" />
                        {option.label}
                      </Link>
                    ),
                  )}
                </div>
              )}
            </div>

            <button
              title="Edit"
              onClick={handleEdit}
              className="hidden lg:flex items-center gap-1.5 px-4 h-8 text-sm font-medium text-white bg-[#0085FF] hover:bg-blue-600 rounded-full transition-colors"
            >
              <EditIcon size={13} />
              Edit
            </button>
          </div>
        </div>

        {/* Social Icons — mobile only, shown below the name/address instead of beside it,
            left-aligned under the name text (past the avatar), not the avatar itself */}
        <div className="flex lg:hidden items-center gap-1.5 mb-3 ml-12">
          <button
            disabled={!hasSocialLink("twitter")}
            className={`w-6 h-6 flex items-center justify-center rounded-full border transition-colors ${hasSocialLink("twitter")
              ? "border-gray-200 text-gray-800 hover:bg-gray-50 cursor-pointer"
              : "border-gray-200 text-gray-300 cursor-not-allowed"
              }`}
            onClick={() => openSocialLink("twitter")}
            title={
              hasSocialLink("twitter")
                ? "View Twitter/X profile"
                : "No Twitter/X link available"
            }
          >
            <Twitter size={12} strokeWidth={2} />
          </button>
          <button
            disabled={!hasSocialLink("linkedin")}
            className={`w-6 h-6 flex items-center justify-center rounded-full border transition-colors ${hasSocialLink("linkedin")
              ? "border-gray-200 text-gray-800 hover:bg-gray-50 cursor-pointer"
              : "border-gray-200 text-gray-300 cursor-not-allowed"
              }`}
            onClick={() => openSocialLink("linkedin")}
            title={
              hasSocialLink("linkedin")
                ? "View LinkedIn profile"
                : "No LinkedIn link available"
            }
          >
            <Linkedin size={12} strokeWidth={2} />
          </button>
          <button
            disabled={!hasSocialLink("facebook")}
            className={`w-6 h-6 flex items-center justify-center rounded-full border transition-colors ${hasSocialLink("facebook")
              ? "border-gray-200 text-gray-800 hover:bg-gray-50 cursor-pointer"
              : "border-gray-200 text-gray-300 cursor-not-allowed"
              }`}
            onClick={() => openSocialLink("facebook")}
            title={
              hasSocialLink("facebook")
                ? "View Instagram profile"
                : "No Instagram link available"
            }
          >
            <Instagram size={12} strokeWidth={2} />
          </button>
        </div>

        {/* Location */}
        {company?.location && (
          <div className="flex items-center gap-2 text-gray-600 mb-3">
            <MapPin size={16} className="text-gray-400" />
            <span className="text-xs">{company.location}</span>
          </div>
        )}

        {/* Separator */}
        <div className="border-b border-gray-200 mb-4 -mx-6"></div>

        {/* Tab Row: pill tab selector */}
        <div className="flex items-center justify-between mb-4 gap-3">
          <div ref={tabTrackRef} className="relative inline-flex items-center gap-1.5 h-10 p-1 bg-[#F1F1F5] rounded-full overflow-x-auto overflow-y-hidden no-scrollbar">
            <span
              className="absolute top-1 bottom-1 rounded-full bg-white shadow-sm transition-all duration-300 ease-out pointer-events-none"
              style={{ left: tabIndicator.left, width: tabIndicator.width }}
            />
            {tabs.map((tab) => (
              <button
                key={tab}
                ref={(el) => (tabRefs.current[tab] = el)}
                onClick={() => setActiveTab(tab)}
                className={`relative z-10 flex flex-shrink-0 items-center justify-center h-8 px-4 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${activeTab === tab
                  ? "text-[#0085FF]"
                  : "text-gray-700 hover:text-gray-900"
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="border-b border-gray-200 mb-4 -mx-6"></div>

        {/* Summary Stats Row */}
        {showStats && activeTab === "Overview" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            {showOverviewSkeleton
              ? Array.from({ length: 6 }).map((_, i) => <StatTileSkeleton key={i} />)
              : statTiles.map((tile) => (
                <StatTile key={tile.label} tile={tile} />
              ))}
          </div>
        )}

        {/* Tab Content */}
        <div className="min-h-[400px]">
          {activeTab === "Overview" && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_319px] gap-4">
                <div className="space-y-4 min-w-0">
                  {/* Deal Pipeline */}
                  <div className="h-[162px] bg-white border border-gray-200 rounded-lg p-5 overflow-hidden">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-900">
                        {showOverviewSkeleton ? <Skeleton width={110} height={14} /> : <>Deal Pipeline ({deals.length})</>}
                      </h3>
                      {showOverviewSkeleton ? (
                        <div className="flex items-center gap-2">
                          <Skeleton shape="circle" width={28} height={28} />
                          <Skeleton shape="circle" width={28} height={28} />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setActiveTab("Deals")}
                            title="View Deals"
                            className="p-1.5 rounded-full text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
                          >
                            <EyeIcon size={14} />
                          </button>
                          <button
                            onClick={() => setActiveTab("Deals")}
                            title="Add Deal"
                            className="w-7 h-7 flex items-center justify-center rounded-full bg-[#0085FF] hover:bg-blue-600 text-white transition-colors"
                          >
                            <PlusIcon className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    {showOverviewSkeleton ? (
                      <div className="flex h-[88px] gap-1">
                        {pipelineStages.map((stage) => (
                          <Skeleton key={stage.key} width="100%" height="100%" shape="rect" className="rounded-md flex-1" />
                        ))}
                      </div>
                    ) : (
                      <div className="flex h-[88px]">
                        {pipelineData.map((stage, idx) => (
                          <div
                            key={stage.key}
                            className={`flex-1 min-w-0 flex flex-col justify-center ${stage.color} ${idx > 0 ? "-ml-2 sm:-ml-3 pl-6 pr-2 sm:pl-8 sm:pr-5" : "pl-6 pr-2 sm:pl-8 sm:pr-5"}`}
                            style={{
                              clipPath:
                                idx === pipelineData.length - 1
                                  ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 20px 50%)"
                                  : "polygon(0 0, calc(100% - 20px) 0, 100% 50%, calc(100% - 20px) 100%, 0 100%, 20px 50%)",
                            }}
                          >
                            <p className="truncate w-full text-[10px] sm:text-xs font-medium">{stage.label}</p>
                            <p className="truncate w-full text-[9px] sm:text-[11px] opacity-70">
                              {stage.count} Deal{stage.count !== 1 ? "s" : ""}
                            </p>
                            <p className="truncate w-full text-[11px] sm:text-sm font-semibold">
                              ₹{stage.amount.toLocaleString("en-IN")}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Financial Overview */}
                  <div
                    className="bg-white border border-gray-200 rounded-lg p-5 flex flex-col min-w-0"
                    style={{ height: 607, maxHeight: 607, minHeight: 607, flexShrink: 0, flexGrow: 0 }}
                  >
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 flex-shrink-0">
                      {showOverviewSkeleton ? <Skeleton width={130} height={14} /> : "Financial Overview"}
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      {showOverviewSkeleton
                        ? Array.from({ length: 4 }).map((_, i) => <StatTileSkeleton key={i} />)
                        : financialTiles.map((tile) => (
                          <div
                            key={tile.label}
                            className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-xl min-w-0"
                          >
                            <div className="flex lg:hidden flex-shrink-0 text-gray-500">
                              <tile.icon size={18} />
                            </div>
                            <div className="hidden lg:flex w-10 h-10 bg-white text-gray-500 rounded-lg items-center justify-center flex-shrink-0 border border-gray-200">
                              <tile.icon size={20} />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate w-full text-[10px] sm:text-[11px] text-gray-500">
                                {tile.label}
                              </p>
                              <p
                                className={`truncate w-full text-xs sm:text-sm font-semibold ${tile.valueClassName || "text-gray-900"}`}
                              >
                                {tile.value}
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>

                    {showOverviewSkeleton ? (
                      <Skeleton
                        width="100%"
                        height="100%"
                        shape="rect"
                        className="rounded-lg"
                        style={{ flex: "1 1 0%", minHeight: 0, maxHeight: 439, flexShrink: 1, flexGrow: 1 }}
                      />
                    ) : (
                      <div className="flex min-w-0" style={{ flex: "1 1 0%", minHeight: 0 }}>
                        {/* Fixed Y-axis, stays put while the plot below scrolls horizontally */}
                        <div style={{ width: 88, height: "100%", flexShrink: 0 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={monthlyIncomeData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                              <XAxis
                                dataKey="month"
                                tickLine={false}
                                axisLine={false}
                                tick={false}
                                padding={{ left: 0, right: 0 }}
                              />
                              <YAxis
                                domain={[0, incomeYMax]}
                                tickLine={false}
                                axisLine={false}
                                allowDecimals={false}
                                tickFormatter={(value) => value.toLocaleString("en-IN")}
                                tick={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", fill: "rgba(33, 32, 31, 0.56)" }}
                                width={88}
                              />
                              <Area type="linear" dataKey="income" stroke="none" fill="none" isAnimationActive={false} />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>

                        <div
                          ref={incomeChartScrollRef}
                          className="income-chart-scroll flex-1 min-w-0 overflow-x-auto overflow-y-hidden"
                          style={{ scrollbarWidth: "none", msOverflowStyle: "none", cursor: chartDotCursor }}
                        >
                          <div
                            style={{ minWidth: Math.max(600, monthlyIncomeData.length * 110), height: "100%" }}
                          >
                            <ResponsiveContainer width="100%" height="100%">
                              <ComposedChart
                                data={monthlyIncomeData}
                                margin={{ top: 8, right: -(Math.max(600, monthlyIncomeData.length * 110) / (monthlyIncomeData.length - 0.5) / 2), left: 0, bottom: 0 }}
                              >
                                <defs>
                                  <linearGradient id="hoverGradient" x1="0" y1="1" x2="0" y2="0">
                                    <stop offset="20.61%" stopColor="#0085FF" stopOpacity={0.6} />
                                    <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.024} />
                                  </linearGradient>
                                  <pattern id="hatchPattern" patternUnits="userSpaceOnUse" width="9" height="8">
                                    <rect width="1" height="8" fill="rgba(0, 133, 255, 0.3)" />
                                  </pattern>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#E7E4E3" vertical={false} />
                                <XAxis
                                  dataKey="month"
                                  tickLine={false}
                                  axisLine={false}
                                  padding={{ left: 0, right: 0 }}
                                  tick={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", fill: "rgba(33, 32, 31, 0.56)" }}
                                />
                                <YAxis domain={[0, incomeYMax]} hide />
                                <Tooltip
                                  content={({ active, payload }) => {
                                    if (!active || !payload || payload.length === 0) return null;
                                    const income = payload[0]?.payload?.income || 0;
                                    return (
                                      <div style={{ position: "relative", display: "inline-block" }}>
                                        <svg
                                          viewBox="0 0 86 62"
                                          preserveAspectRatio="none"
                                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
                                          fill="none"
                                          xmlns="http://www.w3.org/2000/svg"
                                        >
                                          <path fillRule="evenodd" clipRule="evenodd" d="M47.5426 60.1492C45.3504 62.6169 41.7962 62.6169 39.6041 60.1492L35.7402 56.4079C34.8076 55.5049 33.5603 55 32.2621 55H22.0494C14.3824 55 11.6021 54.3038 8.79913 52.9965C5.99616 51.6892 3.79638 49.7708 2.29734 47.3263C0.7983 44.8819 0 42.4573 0 35.7709V19.2291C0 12.5427 0.7983 10.1181 2.29734 7.67366C3.79638 5.22921 5.99616 3.3108 8.79913 2.0035C11.6021 0.696192 14.3824 0 22.0494 0H63.9506C71.6176 0 74.3979 0.696192 77.2009 2.0035C80.0038 3.3108 82.2036 5.22921 83.7027 7.67366C85.2017 10.1181 86 12.5427 86 19.2291V35.7709C86 42.4573 85.2017 44.8819 83.7027 47.3263C82.2036 49.7708 80.0038 51.6892 77.2009 52.9965C74.3979 54.3038 71.6176 55 63.9506 55H56.9085C54.3122 55 51.8177 56.0098 49.9524 57.8158L47.5426 60.1492Z" fill="#21201F" />
                                        </svg>
                                        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "12px 16px 22px", gap: 2, whiteSpace: "nowrap" }}>
                                          <span style={{ color: "#fff", fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>
                                            {`₹${income.toLocaleString("en-IN")}`}
                                          </span>
                                          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 500, lineHeight: 1.2 }}>
                                            Income
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  }}
                                />
                                <Area
                                  type="linear"
                                  dataKey="income"
                                  stroke="none"
                                  fill="url(#hatchPattern)"
                                  isAnimationActive={false}
                                />
                                <Bar dataKey="paidHighlight" shape={renderHighlightShape} background={{ fill: "transparent" }} isAnimationActive={false} />
                                <Area
                                  type="linear"
                                  dataKey="income"
                                  stroke="#0085FF"
                                  strokeWidth={2}
                                  fill="none"
                                  dot={{ r: 3, fill: "#0085FF", strokeWidth: 0 }}
                                  activeDot={{ r: 5 }}
                                />
                              </ComposedChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Child Companies (subsidiaries) — only shown when this
                      company actually has any linked. */}
                  {childCompanies.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-lg p-5">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">
                        Child Companies ({childCompanies.length})
                      </h3>
                      <div className="flex flex-col gap-2">
                        {childCompanies.map((child) => (
                          <Link
                            key={child._id}
                            to={`/companies/${child._id}`}
                            className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                          >
                            <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0">
                              {(child.name || "?").charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{child.name}</p>
                              {child.industry && (
                                <p className="text-xs text-gray-500 truncate">{child.industry}</p>
                              )}
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Sidebar: Activity Timeline + Calendar */}
                <div className="space-y-4">
                  {/* Activity Timeline */}
                  <div className="h-[267px] flex flex-col bg-white border border-gray-200 rounded-lg p-5">
                    <h3 className="text-sm font-semibold text-gray-900 mb-5 flex-shrink-0">
                      {showOverviewSkeleton ? <Skeleton width={110} height={14} /> : "Activity Timeline"}
                    </h3>
                    <div className="flex items-center gap-1 mb-4 flex-wrap flex-shrink-0">
                      {showOverviewSkeleton
                        ? Array.from({ length: 5 }).map((_, i) => (
                          <Skeleton key={i} width={i === 0 ? 36 : 56} height={24} className="rounded-full" />
                        ))
                        : activityFeedTabs.map((tab) => (
                          <button
                            key={tab}
                            onClick={() => setActivityFeedFilter(tab)}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${activityFeedFilter === tab
                              ? "bg-[#0085FF] text-white"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                              }`}
                          >
                            {tab}
                          </button>
                        ))}
                    </div>
                    <div className="space-y-3 overflow-y-auto flex-1 pr-2 -mr-2">
                      {showOverviewSkeleton ? (
                        Array.from({ length: 4 }).map((_, idx) => (
                          <div key={idx} className="flex items-start gap-2.5">
                            <Skeleton shape="circle" width={28} height={28} className="flex-shrink-0" />
                            <div className="min-w-0 flex-1 flex flex-col gap-1">
                              <Skeleton width="80%" height={11} />
                              <Skeleton width="40%" height={10} />
                            </div>
                            <Skeleton width={36} height={11} className="flex-shrink-0" />
                          </div>
                        ))
                      ) : filteredActivityFeed.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">
                          No recent activity.
                        </p>
                      ) : (
                        filteredActivityFeed.map((item, idx) => (
                          <div key={idx} className="flex items-start gap-2.5">
                            <div
                              className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${item.iconClass}`}
                            >
                              <item.icon style={{ width: 13, height: 13 }} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-gray-900 truncate">
                                {item.title}
                              </p>
                              <p className="text-[11px] text-gray-400">
                                {item.date.toLocaleDateString("en-US", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </p>
                            </div>
                            {item.amount != null && (
                              <p className={`text-xs font-semibold flex-shrink-0 ${item.amountClass}`}>
                                ₹{item.amount.toLocaleString("en-IN")}
                              </p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Mini Calendar */}
                  <div className="bg-white border border-gray-200 rounded-lg p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-900">
                        {showOverviewSkeleton ? <Skeleton width={70} height={14} /> : "Calendar"}
                      </h3>
                      {showOverviewSkeleton ? (
                        <Skeleton width={70} height={12} />
                      ) : (
                        <button
                          onClick={() => setActiveTab("Calendar")}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                          View Calendar
                        </button>
                      )}
                    </div>
                    {showOverviewSkeleton ? (
                      <Skeleton width="100%" height={220} />
                    ) : (
                      <>
                        <div className="grid grid-cols-7 gap-1 mb-2">
                          {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
                            <div
                              key={d}
                              className="text-[10px] text-gray-400 text-center font-medium"
                            >
                              {d}
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                          {miniCalendar.days.map((day, idx) => (
                            <div
                              key={idx}
                              className="flex flex-col items-center"
                            >
                              {day && futureEventDays.has(day) && (
                                <span className="mb-1 w-1.5 h-1.5 rounded-full bg-[#1E3A8A] flex-shrink-0"></span>
                              )}
                              <span
                                className={`text-[11px] w-6 h-6 flex items-center justify-center rounded-full ${day === miniCalendar.today
                                  ? "bg-[#0085FF] text-white font-semibold"
                                  : day
                                    ? "text-gray-700"
                                    : ""
                                  }`}
                              >
                                {day || ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    <div className="flex items-center justify-between mt-4 mb-2">
                      <h4 className="text-xs font-semibold text-gray-900">
                        {showOverviewSkeleton ? <Skeleton width={70} height={12} /> : "Upcoming"}
                      </h4>
                      {!showOverviewSkeleton && [...tasks, ...meetings].length > 4 && (
                        <button
                          onClick={() => setShowAllUpcoming(true)}
                          className="text-[10px] font-medium text-blue-600 hover:text-blue-700 hover:underline"
                        >
                          Show All
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {showOverviewSkeleton ? (
                        Array.from({ length: 5 }).map((_, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <Skeleton shape="circle" width={6} height={6} className="mt-1 flex-shrink-0" />
                            <div className="min-w-0 flex-1 flex flex-col gap-1">
                              <Skeleton width="75%" height={11} />
                              <Skeleton width="35%" height={10} />
                            </div>
                          </div>
                        ))
                      ) : upcomingItems.length === 0 ? (
                        <p className="text-xs text-gray-400">Nothing upcoming.</p>
                      ) : (
                        upcomingItems.map((item, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <span
                              className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.overdue ? "bg-red-500" : "bg-blue-500"
                                }`}
                            />
                            <div className="min-w-0">
                              <p
                                className={`text-xs font-medium truncate ${item.overdue ? "text-red-600" : "text-gray-900"
                                  }`}
                              >
                                {item.title} · {item.isMeeting ? "Meeting" : "Task"}
                              </p>
                              <p className="text-[11px] text-gray-400">
                                {item.date.toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "2-digit",
                                })}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Row: Key Contacts / Tasks / Meetings / Key Files */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                {/* Key Contacts */}
                <div className="bg-white border border-gray-200 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">
                      {showOverviewSkeleton ? (
                        <Skeleton width={110} height={14} />
                      ) : (
                        <>Key Contacts ({contacts.length})</>
                      )}
                    </h3>
                    {showOverviewSkeleton ? (
                      <Skeleton width={50} height={12} />
                    ) : (
                      <button
                        onClick={() => setActiveTab("Contacts")}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        View All
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {showOverviewSkeleton ? (
                      Array.from({ length: 3 }).map((_, idx) => (
                        <div key={idx} className="flex items-center gap-2.5">
                          <Skeleton shape="circle" width={32} height={32} className="flex-shrink-0" />
                          <div className="min-w-0 flex-1 flex flex-col gap-1">
                            <Skeleton width="70%" height={11} />
                            <Skeleton width="90%" height={10} />
                          </div>
                        </div>
                      ))
                    ) : contacts.length === 0 ? (
                      <p className="text-xs text-gray-400">No contacts yet.</p>
                    ) : (
                      contacts.slice(0, 3).map((contact) => (
                        <Link
                          to={`/contacts/${contact._id}`}
                          key={contact._id}
                          className="flex items-center gap-2.5 group"
                        >
                          <div className="w-8 h-8 bg-blue-100 group-hover:bg-blue-200 rounded-full flex items-center justify-center font-semibold text-blue-700 text-xs flex-shrink-0 transition-colors">
                            {contact.name?.charAt(0) || "?"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                              {contact.name}
                            </p>
                            <p className="text-[11px] text-gray-400 truncate flex items-center gap-1">
                              {contact.email ? (
                                <>
                                  <Mail size={10} /> {contact.email}
                                </>
                              ) : contact.phone ? (
                                <>
                                  <CellphoneIcon style={{ width: 10, height: 10 }} /> {contact.phone}
                                </>
                              ) : (
                                "No contact info"
                              )}
                            </p>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>

                {/* Tasks */}
                <div className="bg-white border border-gray-200 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">
                      {showOverviewSkeleton ? <Skeleton width={50} height={14} /> : "Tasks"}
                    </h3>
                    {showOverviewSkeleton ? (
                      <Skeleton width={50} height={12} />
                    ) : (
                      <button
                        onClick={() => setActiveTab("Tasks")}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        View All
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {showOverviewSkeleton ? (
                      Array.from({ length: 3 }).map((_, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <Skeleton shape="circle" width={14} height={14} className="flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1 flex flex-col gap-1">
                            <Skeleton width="75%" height={11} />
                            <Skeleton width="45%" height={10} />
                          </div>
                        </div>
                      ))
                    ) : upcomingTasksList.length === 0 ? (
                      <p className="text-xs text-gray-400">No open tasks.</p>
                    ) : (
                      upcomingTasksList.map((task) => (
                        <div key={task._id} className="flex items-start gap-2">
                          <CheckSquare size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-900 truncate">
                              {task.title}
                            </p>
                            <p className="text-[11px] text-gray-400">
                              {relativeDayTimeLabel(task.dueDate, "Due ")}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Meetings */}
                <div className="bg-white border border-gray-200 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">
                      {showOverviewSkeleton ? <Skeleton width={65} height={14} /> : "Meetings"}
                    </h3>
                    {showOverviewSkeleton ? (
                      <Skeleton width={50} height={12} />
                    ) : (
                      <button
                        onClick={() => setActiveTab("Meetings")}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        View All
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {showOverviewSkeleton ? (
                      Array.from({ length: 3 }).map((_, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <Skeleton shape="circle" width={14} height={14} className="flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1 flex flex-col gap-1">
                            <Skeleton width="70%" height={11} />
                            <Skeleton width="40%" height={10} />
                          </div>
                        </div>
                      ))
                    ) : upcomingMeetingsList.length === 0 ? (
                      <p className="text-xs text-gray-400">No upcoming meetings.</p>
                    ) : (
                      upcomingMeetingsList.map((meeting) => (
                        <div key={meeting._id} className="flex items-start gap-2">
                          <TeamIcon className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-900 truncate">
                              {meeting.title}
                            </p>
                            <p className="text-[11px] text-gray-400">
                              {relativeDayTimeLabel(meeting.scheduledAt)}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Key Files */}
                <div className="bg-white border border-gray-200 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">
                      {showOverviewSkeleton ? (
                        <Skeleton width={90} height={14} />
                      ) : (
                        <>Key Files ({keyFiles.length})</>
                      )}
                    </h3>
                    {showOverviewSkeleton ? (
                      <Skeleton width={50} height={12} />
                    ) : (
                      <button
                        onClick={() => setActiveTab("Folders")}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        View All
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {showOverviewSkeleton ? (
                      Array.from({ length: 3 }).map((_, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <Skeleton shape="circle" width={14} height={14} className="flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1 flex flex-col gap-1">
                            <Skeleton width="65%" height={11} />
                            <Skeleton width="35%" height={10} />
                          </div>
                        </div>
                      ))
                    ) : keyFiles.length === 0 ? (
                      <p className="text-xs text-gray-400">No files uploaded.</p>
                    ) : (
                      keyFiles.map((file, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <File size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-900 truncate">
                              {file.fileName}
                            </p>
                            <p className="text-[11px] text-gray-400">
                              {file.uploadedAt
                                ? new Date(file.uploadedAt).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "2-digit",
                                })
                                : ""}
                              {file.fileSize
                                ? ` · ${formatFileSize(file.fileSize)}`
                                : ""}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
          {activeTab === "Deals" && (
            <CompanyDealsKanban
              deals={deals}
              setDeals={setDeals}
              showStats={showStats}
              companyId={id}
              company={company}
              autoOpenCreate={pendingCreate === "deal"}
              onAutoOpenCreateConsumed={() => setPendingCreate(null)}
              contacts={contacts}
              viewMode={dealsViewMode}
              setViewMode={setDealsViewMode}
              isLoading={showRecordsSkeleton}
            />
          )}
          {activeTab === "Contacts" && (
            <CompanyContactsTab
              contacts={contacts}
              meetings={meetings}
              tasks={tasks}
              showStats={showStats}
              companyId={id}
              autoOpenCreate={pendingCreate === "contact"}
              onAutoOpenCreateConsumed={() => setPendingCreate(null)}
              company={company}
              setContacts={setContacts}
              isLoading={showRecordsSkeleton}
            />
          )}
          {activeTab === "Invoices" && (
            <CompanyInvoicesTab
              invoices={invoices}
              summary={invoiceSummary}
              loading={invoicesLoading}
              showStats={showStats}
              deals={deals}
              refreshInvoices={fetchInvoices}
              autoOpenCreate={pendingCreate === "invoice"}
              onAutoOpenCreateConsumed={() => setPendingCreate(null)}
              companyId={id}
              // A deal added from the invoice panel shows up in this page's Deals tab straight
              // away. The tab only reports deals that belong to this company.
              onDealCreated={(newDeal) =>
                setDeals((prev) => (prev.some((d) => d._id === newDeal._id) ? prev : [...prev, newDeal]))
              }
            />
          )}
          {activeTab === "Notes" && (
            <CompanyNotesTab
              showStats={showStats}
              autoOpenCreate={pendingCreate === "note"}
              onAutoOpenCreateConsumed={() => setPendingCreate(null)}
            />
          )}
          {activeTab === "Tasks" && (
            <CompanyTasksTab companyId={id} tasks={tasks} setTasks={setTasks} showStats={showStats} isLoading={showRecordsSkeleton} />
          )}
          {activeTab === "Meetings" && (
            <CompanyMeetingsTab
              companyId={id}
              companyName={company?.name}
              meetings={meetings}
              setMeetings={setMeetings}
              showStats={showStats}
              isLoading={showRecordsSkeleton}
              autoOpenCreate={pendingCreate === "meeting"}
              onAutoOpenCreateConsumed={() => setPendingCreate(null)}
            />
          )}
          {activeTab === "Call Logs" && (
            <div className="animate-in fade-in duration-300">
              <CompanyCallLogsTab
                companyId={id}
                callLogs={callLogs}
                setCallLogs={setCallLogs}
                showStats={showStats}
                isLoading={showRecordsSkeleton}
                pendingCreate={pendingCreate}
                onPendingCreateConsumed={() => setPendingCreate(null)}
              />
            </div>
          )}
          {activeTab === "Folders" && (
            <CompanyFolderTab
              showStats={showStats}
              isLoading={showRecordsSkeleton}
              autoOpenCreate={pendingCreate === "folder"}
              onAutoOpenCreateConsumed={() => setPendingCreate(null)}
            />
          )}
          {activeTab === "Calendar" && <CompanyCalendar companyId={id} />}
        </div>
      </div>
      {showAllUpcoming && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">All Upcoming Events</h2>
              <button onClick={() => setShowAllUpcoming(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {[...tasks, ...meetings]
                .map((item) => ({
                  title: item.title,
                  date: new Date(item.dueDate || item.scheduledAt),
                  overdue:
                    item.status !== "Completed" &&
                    (item.dueDate || item.scheduledAt) &&
                    new Date(item.dueDate || item.scheduledAt) < new Date(),
                  isMeeting: !!item.scheduledAt,
                  original: item
                }))
                .filter((item) => !isNaN(item.date))
                .sort((a, b) => a.date - b.date)
                .map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50/50">
                    <span
                      className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${item.overdue ? "bg-red-500" : "bg-blue-500"
                        }`}
                    />
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-medium truncate ${item.overdue ? "text-red-600" : "text-gray-900"
                          }`}
                      >
                        {item.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {item.date.toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric"
                        })} {item.isMeeting && " · " + item.date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                        <span className="ml-1 text-[10px] uppercase font-semibold text-gray-400">({item.isMeeting ? "Meeting" : "Task"})</span>
                      </p>
                    </div>
                  </div>
                ))}
              {[...tasks, ...meetings].length === 0 && (
                <p className="text-sm text-center text-gray-500 py-4">No upcoming tasks or meetings.</p>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => {
                  setShowAllUpcoming(false);
                  setActiveTab("Meetings");
                  setPendingCreate("meeting");
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <PlusIcon className="w-4 h-4" /> Add New Meeting
              </button>
            </div>
          </div>
        </div>
      )}
      <SubsidiaryModal
        companyId={id}
        isOpen={showSubsidiaryModal}
        onClose={() => setShowSubsidiaryModal(false)}
        onSuccess={() => {
          fetchCompanyDetails();
          API.get(`/companies/${id}/subsidiaries`)
            .then((res) => setChildCompanies(res.data || []))
            .catch(() => {});
        }}
      />
      <MergeCompanyModal
        primaryCompany={company}
        isOpen={showMergeModal}
        onClose={() => setShowMergeModal(false)}
        onSuccess={() => {
          fetchCompanyDetails();
        }}
      />
      <AppToaster />
    </div>
  );
};

export default CompanyProfilePage;
import Skeleton from "../components/common/Skeleton";
import TeamIcon from "../components/common/TeamIcon";
import EyeIcon from "../components/common/EyeIcon";
import EditIcon from "../components/common/EditIcon";