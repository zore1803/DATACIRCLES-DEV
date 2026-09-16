import DeleteIcon from "../components/common/DeleteIcon";
import Checkbox from "../components/common/Checkbox";
import MoreIcon from "../components/common/MoreIcon";
import DownloadIcon from "../components/common/DownloadIcon";
import { useEffect, useState, useMemo, useRef, Fragment } from "react";
import { createPortal } from "react-dom";
import { createColumnHelper } from "@tanstack/react-table";
import { ResponsiveContainer, ComposedChart, XAxis, YAxis, Area, Line, CartesianGrid, Tooltip } from "recharts";
import { formatNumberToIndian } from "../utils/numberFormatter";
import CrmHealthGauge from "../components/dashboard/CrmHealthGauge";
import { TrendingUp, TrendingDown, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Pin, PinOff, EyeOff, X, CheckSquare, Building2, Users, ListChecks, ArrowUp, ArrowDown } from "lucide-react";
import VideoIcon from "../components/common/VideoIcon";
import FilterIcon from "../components/common/FilterIcon";
import DataTable from "../components/common/DataTable";
import InvoiceQuickView from "../components/invoice/InvoiceQuickView";
import Skeleton from "../components/common/Skeleton";
import StatTile from "../components/common/StatTile";
import StatTileSkeleton from "../components/common/StatTileSkeleton";
import { useTopLoadingSignal } from "../components/common/TopLoadingBar";
import { useSubscription } from "../contexts/SubscriptionContext";
import { hasMinPlan } from "../utils/subscriptionHelpers";
import UpgradeRequiredModal from "../components/subscription/UpgradeRequiredModal";

const getRootZoom = () => {
  if (typeof window === "undefined") return 1;
  const z = parseFloat(getComputedStyle(document.documentElement).zoom);
  return z && !Number.isNaN(z) ? z : 1;
};

// Default column config for the Invoices table (order + visibility + pin state
// are managed in component state, mirroring the Companies list).
const defaultInvoiceColumns = [
  { key: "invoiceId", label: "Invoice Id", visible: true, order: 0, sortable: true },
  { key: "client", label: "Client", visible: true, order: 1, sortable: true },
  { key: "contact", label: "Contact", visible: true, order: 2, sortable: true },
  { key: "deal", label: "Deal", visible: true, order: 3, sortable: true },
  { key: "invoiceDate", label: "Invoice Date", visible: true, order: 4, sortable: true },
  { key: "amount", label: "Amount", visible: true, order: 5, sortable: true },
  { key: "dueDate", label: "Due Date", visible: true, order: 6, sortable: true },
  { key: "status", label: "Status", visible: true, order: 7, sortable: true },
];

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Wraps every case-insensitive occurrence of `query` inside `text` in a <mark>.
const HighlightText = ({ text, query }) => {
  const str = text === null || text === undefined ? "" : String(text);
  const q = (query || "").trim();
  if (!q) return <>{str}</>;

  const parts = str.split(new RegExp(`(${escapeRegExp(q)})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-yellow-200 text-inherit rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
};

const getInvoiceFieldValue = (inv, key) => {
  switch (key) {
    case "invoiceId": return inv.invoiceNumber || "";
    case "client": return inv.deal?.company?.name || "";
    case "contact": return inv.deal?.contact?.name || "";
    case "deal": return inv.deal?.title || "";
    case "invoiceDate": return inv.date ? new Date(inv.date).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" }) : "";
    case "amount": return inv.amount != null ? `₹${Math.round(inv.amount).toLocaleString("en-IN")}` : "";
    case "dueDate": return inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" }) : "";
    case "status": return inv.status || "";
    default: return "";
  }
};

const invoiceColumnHelper = createColumnHelper();

const formatSalesRevenueTick = (value) => (value === 0 ? "0" : `₹${Math.round(value / 1000)}k`);

// Compact rupee for tight axes: crores, then lakhs, then thousands.
const formatCompactRupee = (value) => {
  const n = Math.abs(value || 0);
  if (n === 0) return "₹0";
  if (n >= 1e7) return `₹${(value / 1e7).toFixed(n >= 1e8 ? 0 : 1)} Cr`;
  if (n >= 1e5) return `₹${(value / 1e5).toFixed(n >= 1e6 ? 0 : 1)}L`;
  if (n >= 1e3) return `₹${Math.round(value / 1e3)}k`;
  return `₹${Math.round(value)}`;
};

const InvoicesIcon = ({ size = 20, style }) => (
  <svg width={size} height={size} viewBox="0 0 15 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={style}>
    <path d="M0 15.6408V0L1.15396 1.02562L2.33979 0L3.52563 1.02562L4.71146 0L5.8975 1.02562L7.08333 0L8.26917 1.02562L9.45521 0L10.641 1.02562L11.8269 0L13.0127 1.02562L14.1667 0V15.6408L13.0127 14.6152L11.8269 15.6408L10.641 14.6152L9.45521 15.6408L8.26917 14.6152L7.08333 15.6408L5.8975 14.6152L4.71146 15.6408L3.52563 14.6152L2.33979 15.6408L1.15396 14.6152L0 15.6408ZM2.29167 11.5223H11.875V10.2723H2.29167V11.5223ZM2.29167 8.44542H11.875V7.19542H2.29167V8.44542ZM2.29167 5.36854H11.875V4.11854H2.29167V5.36854ZM1.25 13.7371H12.9167V1.90375H1.25V13.7371Z" fill={style?.color || "#1C1B1F"} />
  </svg>
);
import API from "../services/api";
import toast from "react-hot-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import TaskAndMeeting, { TasksCard } from "../components/dashboard/TaskAndMeeting";
import ClientsAndDeals from "../components/dashboard/ClientsAndDeals";
import RevenueOvertime from "../components/dashboard/RevenueOvertime";
import PaymentInformation from "../components/dashboard/PaymentInformation";
import MeetingsInformation from "../components/dashboard/MeetingsInformation";
import logo from "/DataCircles.png";

import SearchIcon from "../components/common/SearchIcon";
import EyeIcon from "../components/common/EyeIcon";
import EditIcon from "../components/common/EditIcon";
// The four KPI icons below are each authored at a different native aspect
// ratio (22x18, 19x18, 22x19, 18x17). They used to render at `width={size}`
// with a height computed from that ratio, so the "size" prop only ever
// controlled width — actual on-screen height varied icon to icon, and inside
// the KPI cards' identically-sized badge boxes that showed up as visibly
// mismatched icon sizes. Rendering all four into the same square box (default
// SVG `preserveAspectRatio="xMidYMid meet"` scales each viewBox to fit
// without distorting it) makes every icon's bounding box the same regardless
// of its native proportions.
const TotalIncomeIcon = ({ size = 24, style }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={style}>
    <path d="M12.275 15.25C12.4583 15.0833 12.5583 14.875 12.575 14.625C12.5917 14.375 12.5083 14.1583 12.325 13.975L9.55 11.05L9.575 10.975H9.825C10.725 10.975 11.4708 10.7 12.0625 10.15C12.6542 9.6 13.0167 8.95833 13.15 8.225H13.575C13.7417 8.225 13.8792 8.16667 13.9875 8.05C14.0958 7.93333 14.15 7.79167 14.15 7.625C14.15 7.45833 14.0958 7.32083 13.9875 7.2125C13.8792 7.10417 13.7417 7.05 13.575 7.05H13.125C13.075 6.8 12.9875 6.5625 12.8625 6.3375C12.7375 6.1125 12.5833 5.89167 12.4 5.675H13.575C13.7417 5.675 13.8792 5.61667 13.9875 5.5C14.0958 5.38333 14.15 5.24167 14.15 5.075C14.15 4.90833 14.0958 4.77083 13.9875 4.6625C13.8792 4.55417 13.7417 4.5 13.575 4.5H6.575C6.375 4.5 6.20417 4.57083 6.0625 4.7125C5.92083 4.85417 5.85 5.025 5.85 5.225C5.85 5.425 5.92083 5.59167 6.0625 5.725C6.20417 5.85833 6.375 5.925 6.575 5.925H9.75C10.1833 5.925 10.5375 6.03333 10.8125 6.25C11.0875 6.46667 11.275 6.73333 11.375 7.05H6.425C6.25833 7.05 6.12083 7.10833 6.0125 7.225C5.90417 7.34167 5.85 7.48333 5.85 7.65C5.85 7.81667 5.90417 7.95417 6.0125 8.0625C6.12083 8.17083 6.25833 8.225 6.425 8.225H11.4C11.3 8.55833 11.1083 8.84583 10.825 9.0875C10.5417 9.32917 10.1583 9.45 9.675 9.45H7.975C7.75833 9.45 7.57083 9.5 7.4125 9.6C7.25417 9.7 7.13333 9.84167 7.05 10.025C6.96667 10.2083 6.94167 10.3958 6.975 10.5875C7.00833 10.7792 7.1 10.9583 7.25 11.125L11 15.225C11.1667 15.4083 11.375 15.5 11.625 15.5C11.875 15.5 12.0917 15.4167 12.275 15.25ZM10 20C8.61667 20 7.31667 19.7375 6.1 19.2125C4.88333 18.6875 3.825 17.975 2.925 17.075C2.025 16.175 1.3125 15.1167 0.7875 13.9C0.2625 12.6833 0 11.3833 0 10C0 8.61667 0.2625 7.31667 0.7875 6.1C1.3125 4.88333 2.025 3.825 2.925 2.925C3.825 2.025 4.88333 1.3125 6.1 0.7875C7.31667 0.2625 8.61667 0 10 0C11.3833 0 12.6833 0.2625 13.9 0.7875C15.1167 1.3125 16.175 2.025 17.075 2.925C17.975 3.825 18.6875 4.88333 19.2125 6.1C19.7375 7.31667 20 8.61667 20 10C20 11.3833 19.7375 12.6833 19.2125 13.9C18.6875 15.1167 17.975 16.175 17.075 17.075C16.175 17.975 15.1167 18.6875 13.9 19.2125C12.6833 19.7375 11.3833 20 10 20ZM10 18C12.2333 18 14.125 17.225 15.675 15.675C17.225 14.125 18 12.2333 18 10C18 7.76667 17.225 5.875 15.675 4.325C14.125 2.775 12.2333 2 10 2C7.76667 2 5.875 2.775 4.325 4.325C2.775 5.875 2 7.76667 2 10C2 12.2333 2.775 14.125 4.325 15.675C5.875 17.225 7.76667 18 10 18Z" fill={style?.color || "#0085FF"} />
  </svg>
);

const DealValueOvertimeIcon = ({ size = 24, style }) => (
  <svg width={size} height={size} viewBox="0 0 20 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={style}>
    <path d="M0.288 11.3C0.088 11.1 -0.00783333 10.8625 0.0005 10.5875C0.00883333 10.3125 0.104667 10.0833 0.288 9.9L5.563 4.55C5.94633 4.16667 6.42133 3.975 6.988 3.975C7.55467 3.975 8.02967 4.16667 8.413 4.55L10.988 7.15L16.188 2H14.588C14.3047 2 14.0672 1.90417 13.8755 1.7125C13.6838 1.52083 13.588 1.28333 13.588 1C13.588 0.716667 13.6838 0.479167 13.8755 0.2875C14.0672 0.0958333 14.3047 0 14.588 0H18.588C18.8713 0 19.1088 0.0958333 19.3005 0.2875C19.4922 0.479167 19.588 0.716667 19.588 1V5C19.588 5.28333 19.4922 5.52083 19.3005 5.7125C19.1088 5.90417 18.8713 6 18.588 6C18.3047 6 18.0672 5.90417 17.8755 5.7125C17.6838 5.52083 17.588 5.28333 17.588 5V3.4L12.413 8.575C12.0297 8.95833 11.5547 9.15 10.988 9.15C10.4213 9.15 9.94633 8.95833 9.563 8.575L6.988 6L1.688 11.3C1.50467 11.4833 1.27133 11.575 0.988 11.575C0.704667 11.575 0.471333 11.4833 0.288 11.3Z" fill={style?.color || "#0085FF"} />
  </svg>
);

const TotalDealsClosedIcon = ({ size = 24, style }) => (
  <svg width={size} height={size} viewBox="0 0 22 19" fill="none" xmlns="http://www.w3.org/2000/svg" style={style}>
    <path d="M10.2932 17.4807C10.3918 17.4807 10.4922 17.4577 10.5942 17.4115C10.696 17.3653 10.7764 17.3128 10.8354 17.2538L18.8334 9.25575C19.0591 9.03008 19.229 8.789 19.3432 8.5325C19.4572 8.27617 19.5142 8.007 19.5142 7.725C19.5142 7.43267 19.4572 7.15125 19.3432 6.88075C19.229 6.61008 19.0591 6.36708 18.8334 6.15175L14.8334 2.15175C14.6181 1.92608 14.3848 1.761 14.1334 1.6565C13.8823 1.55217 13.6105 1.5 13.3182 1.5C13.0362 1.5 12.7653 1.55217 12.5057 1.6565C12.246 1.761 12.0066 1.92608 11.7874 2.15175L11.2142 2.725L13.0642 4.59025C13.2885 4.80442 13.4543 5.04867 13.5614 5.323C13.6684 5.59733 13.7219 5.88192 13.7219 6.17675C13.7219 6.78708 13.5181 7.29608 13.1104 7.70375C12.7028 8.11142 12.1938 8.31525 11.5834 8.31525C11.2886 8.31525 11.003 8.2665 10.7267 8.169C10.4505 8.07167 10.2053 7.91592 9.99118 7.70175L8.09693 5.823L3.75093 10.169C3.67526 10.2447 3.61851 10.3293 3.58068 10.423C3.54285 10.5165 3.52393 10.6127 3.52393 10.7115C3.52393 10.896 3.58676 11.0537 3.71243 11.1845C3.8381 11.3153 3.99318 11.3808 4.17768 11.3808C4.27651 11.3808 4.37685 11.3577 4.47868 11.3115C4.58068 11.2653 4.66118 11.2128 4.72018 11.1538L8.00468 7.86925L9.05843 8.923L5.78918 12.2075C5.71368 12.2832 5.65701 12.3678 5.61918 12.4615C5.58135 12.555 5.56243 12.6512 5.56243 12.75C5.56243 12.9282 5.62685 13.0817 5.75568 13.2105C5.88451 13.3393 6.03801 13.4038 6.21618 13.4038C6.31501 13.4038 6.41535 13.3807 6.51718 13.3345C6.61918 13.2883 6.6996 13.2358 6.75843 13.1768L10.1584 9.79225L11.2124 10.846L7.82768 14.246C7.75851 14.305 7.70343 14.3854 7.66243 14.4873C7.62143 14.5893 7.60093 14.6896 7.60093 14.7883C7.60093 14.9666 7.66535 15.1202 7.79418 15.249C7.92301 15.3778 8.07651 15.4423 8.25468 15.4423C8.35335 15.4423 8.44951 15.4233 8.54318 15.3855C8.63668 15.3477 8.72126 15.2909 8.79693 15.2153L12.1969 11.8308L13.2509 12.8845L9.85093 16.2845C9.77526 16.3602 9.71851 16.448 9.68068 16.548C9.64285 16.648 9.62393 16.7442 9.62393 16.8365C9.62393 17.021 9.69251 17.1745 9.82968 17.297C9.96685 17.4195 10.1213 17.4807 10.2932 17.4807ZM10.2777 18.9805C9.71235 18.9805 9.21943 18.7844 8.79893 18.3923C8.37843 17.9999 8.1586 17.5114 8.13943 16.9268C7.57276 16.8883 7.09935 16.687 6.71918 16.323C6.33901 15.9588 6.13293 15.4806 6.10093 14.8883C5.5086 14.8499 5.02976 14.6429 4.66443 14.2673C4.29893 13.8916 4.10335 13.4191 4.07768 12.8497C3.48285 12.8114 2.99185 12.5957 2.60468 12.2028C2.21751 11.8098 2.02393 11.3127 2.02393 10.7115C2.02393 10.4167 2.08001 10.1278 2.19218 9.845C2.30435 9.56233 2.46751 9.314 2.68168 9.1L8.09693 3.7L11.0259 6.62875C11.0848 6.69792 11.1619 6.75308 11.2574 6.79425C11.3531 6.83525 11.4567 6.85575 11.5682 6.85575C11.7502 6.85575 11.9072 6.7955 12.0392 6.675C12.1713 6.5545 12.2374 6.39675 12.2374 6.20175C12.2374 6.09025 12.2169 5.98675 12.1759 5.89125C12.1348 5.79575 12.0796 5.7185 12.0104 5.6595L8.50268 2.15175C8.28735 1.92608 8.05243 1.761 7.79793 1.6565C7.54343 1.55217 7.27001 1.5 6.97768 1.5C6.69568 1.5 6.4281 1.55217 6.17493 1.6565C5.9216 1.761 5.68218 1.92608 5.45668 2.15175L2.17193 5.45175C1.98993 5.63375 1.84093 5.84883 1.72493 6.097C1.60893 6.345 1.54068 6.59792 1.52018 6.85575C1.49951 7.06858 1.5091 7.27917 1.54893 7.4875C1.5886 7.69583 1.65843 7.89167 1.75843 8.075L0.654681 9.17875C0.429014 8.85308 0.259181 8.48833 0.145181 8.0845C0.0310144 7.68067 -0.015819 7.27108 0.004681 6.85575C0.025181 6.39542 0.129014 5.95083 0.316181 5.522C0.503348 5.09317 0.765514 4.71017 1.10268 4.373L4.37768 1.098C4.75218 0.733833 5.1596 0.459833 5.59993 0.275999C6.04026 0.0919995 6.50276 0 6.98743 0C7.47193 0 7.93276 0.0919995 8.36993 0.275999C8.80726 0.459833 9.20793 0.733833 9.57193 1.098L10.1452 1.671L10.7182 1.098C11.0925 0.733833 11.4983 0.459833 11.9354 0.275999C12.3726 0.0919995 12.8335 0 13.3182 0C13.8028 0 14.2653 0.0919995 14.7057 0.275999C15.146 0.459833 15.5483 0.733833 15.9124 1.098L19.8874 5.073C20.2514 5.43717 20.5303 5.85158 20.7239 6.31625C20.9174 6.78092 21.0142 7.25558 21.0142 7.74025C21.0142 8.22492 20.9174 8.68583 20.7239 9.123C20.5303 9.56017 20.2514 9.96075 19.8874 10.3247L11.8892 18.3075C11.6687 18.528 11.4203 18.6953 11.1442 18.8095C10.8678 18.9235 10.579 18.9805 10.2777 18.9805Z" fill={style?.color || "#0085FF"} />
  </svg>
);

const RevenueGeneratedIcon = ({ size = 24, style }) => (
  <svg width={size} height={size} viewBox="0 0 19 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={style}>
    <path d="M5 9.75V5.5C5 5.08333 5.14583 4.72917 5.4375 4.4375C5.72917 4.14583 6.08333 4 6.5 4C6.91667 4 7.27083 4.14583 7.5625 4.4375C7.85417 4.72917 8 5.08333 8 5.5V9.75C8 10.1667 7.85417 10.5208 7.5625 10.8125C7.27083 11.1042 6.91667 11.25 6.5 11.25C6.08333 11.25 5.72917 11.1042 5.4375 10.8125C5.14583 10.5208 5 10.1667 5 9.75ZM10 9.525V1.5C10 1.08333 10.1458 0.729167 10.4375 0.4375C10.7292 0.145833 11.0833 0 11.5 0C11.9167 0 12.2708 0.145833 12.5625 0.4375C12.8542 0.729167 13 1.08333 13 1.5V9.525C13 10.025 12.8458 10.4 12.5375 10.65C12.2292 10.9 11.8833 11.025 11.5 11.025C11.1167 11.025 10.7708 10.9 10.4625 10.65C10.1542 10.4 10 10.025 10 9.525ZM0 12.975V9.5C0 9.08333 0.145833 8.72917 0.4375 8.4375C0.729167 8.14583 1.08333 8 1.5 8C1.91667 8 2.27083 8.14583 2.5625 8.4375C2.85417 8.72917 3 9.08333 3 9.5V12.975C3 13.475 2.84583 13.85 2.5375 14.1C2.22917 14.35 1.88333 14.475 1.5 14.475C1.11667 14.475 0.770833 14.35 0.4625 14.1C0.154167 13.85 0 13.475 0 12.975ZM2.4 19.05C1.96667 19.05 1.6625 18.8458 1.4875 18.4375C1.3125 18.0292 1.38333 17.6667 1.7 17.35L5.8 13.25C5.98333 13.0667 6.20417 12.9667 6.4625 12.95C6.72083 12.9333 6.95 13.0167 7.15 13.2L10 15.65L15.6 10.05H15C14.7167 10.05 14.4792 9.95417 14.2875 9.7625C14.0958 9.57083 14 9.33333 14 9.05C14 8.76667 14.0958 8.52917 14.2875 8.3375C14.4792 8.14583 14.7167 8.05 15 8.05H18C18.2833 8.05 18.5208 8.14583 18.7125 8.3375C18.9042 8.52917 19 8.76667 19 9.05V12.05C19 12.3333 18.9042 12.5708 18.7125 12.7625C18.5208 12.9542 18.2833 13.05 18 13.05C17.7167 13.05 17.4792 12.9542 17.2875 12.7625C17.0958 12.5708 17 12.3333 17 12.05V11.45L10.75 17.7C10.5667 17.8833 10.3458 17.9833 10.0875 18C9.82917 18.0167 9.6 17.9333 9.4 17.75L6.55 15.3L3.1 18.75C3.01667 18.8333 2.9125 18.9042 2.7875 18.9625C2.6625 19.0208 2.53333 19.05 2.4 19.05Z" fill={style?.color || "#0085FF"} />
  </svg>
);

function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeDashboardTab = searchParams.get("tab") || "Overview";
  const setActiveDashboardTab = (tab) => {
    setSearchParams(tab === "Overview" ? {} : { tab });
  };
  const DASHBOARD_TABS = ["Overview", "CRM", "Invoices"];
  const DashboardTabSwitcher = () => (
    <div className="inline-flex items-center gap-1 h-10 p-1 bg-[#F1F1F5] rounded-full flex-shrink-0">
      {DASHBOARD_TABS.map((name) => {
        const isActive = activeDashboardTab === name;
        return (
          <button
            key={name}
            onClick={() => setActiveDashboardTab(name)}
            className={`flex items-center justify-center h-8 px-4 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              isActive ? "bg-white shadow-sm" : "text-gray-700 hover:text-gray-900"
            }`}
            style={isActive ? { color: "var(--btn-primary, #0085FF)" } : undefined}
          >
            {name}
          </button>
        );
      })}
    </div>
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useTopLoadingSignal(loading);

  const [user, setUser] = useState({});
  const [tasks, setTasks] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [allMeetings, setAllMeetings] = useState([]);

  const [deals, setDeals] = useState([]);
  const [invoices, setInvoices] = useState([]);

  const salesRevenueScrollRef = useRef(null);

  // Sales Revenue chart visible window: 5 months at a time on mobile (<lg), 12 on desktop.
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 1024
  );
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1023px)");
    const handler = (e) => setIsMobileViewport(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const [selectedInvoices, setSelectedInvoices] = useState([]);
  const { subscription } = useSubscription();
  const hasBulkAccess = hasMinPlan(subscription?.subscription?.planName, "growth");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  // Delays the bulk-strip's unmount so it can play a slide-out-right exit
  // animation on deselect (mirroring the slide-in entrance).
  const [showBulkStrip, setShowBulkStrip] = useState(false);
  const [bulkStripClosing, setBulkStripClosing] = useState(false);
  useEffect(() => {
    if (selectedInvoices.length > 0) {
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
  }, [selectedInvoices.length]);
  const [invoiceSearchTerm, setInvoiceSearchTerm] = useState("");
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoicesPerPage, setInvoicesPerPage] = useState(10);
  const [invoiceEditingPage, setInvoiceEditingPage] = useState(false);
  const [invoicePageInput, setInvoicePageInput] = useState("");
  const [invoiceSortConfig, setInvoiceSortConfig] = useState({ key: null, direction: "asc" });

  // "Earnings Performance" widget — quarter picker
  const [selectedQuarter, setSelectedQuarter] = useState("Q1");
  const [showQuarterMenu, setShowQuarterMenu] = useState(false);

  // Invoices table (Companies-style): column sizing, pin state, column config
  // (order/visibility) and the per-column header menu.
  const [invoiceColumnSizing, setInvoiceColumnSizing] = useState({});
  const [invoicePinnedColumns, setInvoicePinnedColumns] = useState([]); // [{ key, side }]
  const [invoiceColumnsConfig, setInvoiceColumnsConfig] = useState(defaultInvoiceColumns);
  const [openInvoiceColMenuKey, setOpenInvoiceColMenuKey] = useState(null);
  const [openInvoiceActionsId, setOpenInvoiceActionsId] = useState(null);
  const [invoiceActionsPos, setInvoiceActionsPos] = useState(null);
  const invoiceActionsRef = useRef(null);
  // Invoice view/edit slide-over: { invoice, mode: "view" | "edit" }
  const [invoiceQuickView, setInvoiceQuickView] = useState(null);
  const [invoiceColMenuPos, setInvoiceColMenuPos] = useState(null);
  const invoiceColMenuRef = useRef(null);
  const selectedInvoicesSet = useMemo(() => new Set(selectedInvoices), [selectedInvoices]);

  const invoiceVisibleColumns = useMemo(
    () => [...invoiceColumnsConfig].filter((c) => c.visible).sort((a, b) => a.order - b.order),
    [invoiceColumnsConfig],
  );

  const invoicePinColumnToSide = (colKey, side) =>
    setInvoicePinnedColumns((prev) => [...prev.filter((p) => p.key !== colKey), { key: colKey, side }]);
  const invoiceUnpinColumn = (colKey) =>
    setInvoicePinnedColumns((prev) => prev.filter((p) => p.key !== colKey));
  const getInvoicePinSide = (colKey) => invoicePinnedColumns.find((p) => p.key === colKey)?.side || null;

  const handleInvoiceColumnReorder = (draggedKey, targetKey) => {
    if (!draggedKey || draggedKey === targetKey) return;
    const sorted = [...invoiceColumnsConfig].sort((a, b) => a.order - b.order);
    const visibleSorted = sorted.filter((c) => c.visible);
    const draggedIdx = visibleSorted.findIndex((c) => c.key === draggedKey);
    const targetIdx = visibleSorted.findIndex((c) => c.key === targetKey);
    if (draggedIdx === -1 || targetIdx === -1) return;
    const reordered = [...visibleSorted];
    const [moved] = reordered.splice(draggedIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    let cursor = 0;
    setInvoiceColumnsConfig(
      sorted.map((c) => (c.visible ? reordered[cursor++] : c)).map((c, idx) => ({ ...c, order: idx })),
    );
  };

  const handleInvoiceSort = (key, direction) => {
    setInvoiceSortConfig((prev) =>
      direction
        ? { key, direction }
        : { key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc" },
    );
  };

  const handleSelectAllInvoices = () => {
    if (!hasBulkAccess) {
      setShowUpgradeModal(true);
      return;
    }
    setSelectedInvoices((prev) => (prev.length === invoices.length ? [] : invoices.map((inv) => inv._id)));
  };

  const handleSelectInvoice = (id) => {
    if (!hasBulkAccess) {
      setShowUpgradeModal(true);
      return;
    }
    setSelectedInvoices((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // "Select All" grabs every invoice matching the current search (all
  // invoices are already loaded client-side, so this selects the full
  // filtered set, not only the current page). "Deselect All" is its
  // counterpart: it doesn't clear the selection outright — it steps back
  // down to only the rows on the current page.
  const handleSelectAllInvoicesAcrossPages = () => {
    setSelectedInvoices(sortedInvoices.map((inv) => inv._id));
  };

  const handleDeselectAllInvoicesExtra = () => {
    setSelectedInvoices(paginatedInvoices.map((inv) => inv._id));
  };

  const [showBulkInvoiceDeleteModal, setShowBulkInvoiceDeleteModal] = useState(false);
  const [showBulkInvoiceStatusModal, setShowBulkInvoiceStatusModal] = useState(false);
  const [bulkInvoiceStatus, setBulkInvoiceStatus] = useState("Paid");
  const [bulkInvoiceLoading, setBulkInvoiceLoading] = useState(false);

  const handleBulkDeleteInvoices = async () => {
    setBulkInvoiceLoading(true);
    try {
      await Promise.all(selectedInvoices.map((id) => API.delete(`/invoices/${id}`)));
      setInvoices((prev) => prev.filter((i) => !selectedInvoices.includes(i._id)));
      toast.success(`${selectedInvoices.length} invoice(s) deleted`);
      setSelectedInvoices([]);
      setShowBulkInvoiceDeleteModal(false);
    } catch (err) {
      console.error("Bulk invoice delete failed:", err);
      toast.error(err.response?.data?.message || "Bulk delete failed");
    } finally {
      setBulkInvoiceLoading(false);
    }
  };

  const handleBulkUpdateInvoiceStatus = async () => {
    setBulkInvoiceLoading(true);
    try {
      await Promise.all(
        selectedInvoices.map((id) => API.put(`/invoices/status/${id}`, { status: bulkInvoiceStatus })),
      );
      setInvoices((prev) =>
        prev.map((i) => (selectedInvoices.includes(i._id) ? { ...i, status: bulkInvoiceStatus } : i)),
      );
      toast.success(`${selectedInvoices.length} invoice(s) updated`);
      setSelectedInvoices([]);
      setShowBulkInvoiceStatusModal(false);
    } catch (err) {
      console.error("Bulk invoice status update failed:", err);
      toast.error(err.response?.data?.message || "Bulk update failed");
    } finally {
      setBulkInvoiceLoading(false);
    }
  };

  const handleExportSelectedInvoices = () => {
    const rows = invoices.filter((i) => selectedInvoices.includes(i._id));
    const header = ["Invoice Id", "Client", "Deal", "Invoice Date", "Amount", "Due Date", "Status"];
    const csvRows = rows.map((inv) =>
      [
        inv.invoiceNumber || "",
        inv.deal?.company?.name || "",
        inv.deal?.title || "",
        inv.date ? new Date(inv.date).toLocaleDateString("en-IN") : "",
        inv.amount || 0,
        inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-IN") : "",
        inv.status || "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [header.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "invoices-export.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleViewInvoice = (inv) => {
    setInvoiceQuickView({ invoice: inv, mode: "view" });
  };

  const handleEditInvoice = (inv) => {
    setInvoiceQuickView({ invoice: inv, mode: "edit" });
  };

  const [invoiceToDelete, setInvoiceToDelete] = useState(null);

  const handleDeleteInvoice = (inv) => {
    setInvoiceToDelete(inv);
  };

  const confirmDeleteInvoice = async () => {
    const inv = invoiceToDelete;
    if (!inv) return;
    setInvoiceToDelete(null);
    try {
      await API.delete(`/invoices/${inv._id}`);
      setInvoices((prev) => prev.filter((i) => i._id !== inv._id));
      setSelectedInvoices((prev) => prev.filter((id) => id !== inv._id));
      toast.success("Invoice deleted");
    } catch (err) {
      console.error("Failed to delete invoice:", err);
      toast.error(err.response?.data?.message || "Failed to delete invoice");
    }
  };

  const sortedInvoices = useMemo(() => {
    const term = invoiceSearchTerm.trim().toLowerCase();
    const filtered = term
      ? invoices.filter((inv) => {
          const values = ["invoiceId", "client", "contact", "deal", "invoiceDate", "amount", "dueDate", "status"]
            .map((key) => String(getInvoiceFieldValue(inv, key) ?? "").trim())
            .filter(Boolean);
          // Also match the raw, unformatted amount (no ₹ / commas) so typing
          // plain digits like "45000" still finds "₹45,000".
          if (inv.amount != null) values.push(String(Math.round(inv.amount)));
          return values.some((v) => v.toLowerCase().includes(term));
        })
      : invoices;

    if (!invoiceSortConfig.key) return filtered;
    const getVal = (inv) => {
      switch (invoiceSortConfig.key) {
        case "invoiceId": return inv.invoiceNumber || "";
        case "client": return inv.deal?.company?.name || "";
        case "contact": return inv.deal?.contact?.name || "";
        case "deal": return inv.deal?.title || "";
        case "invoiceDate": return new Date(inv.date || 0).getTime();
        case "amount": return inv.amount || 0;
        case "dueDate": return new Date(inv.dueDate || 0).getTime();
        case "status": return inv.status || "";
        default: return "";
      }
    };
    return [...filtered].sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (va < vb) return invoiceSortConfig.direction === "asc" ? -1 : 1;
      if (va > vb) return invoiceSortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [invoices, invoiceSortConfig, invoiceSearchTerm]);

  const invoiceTotalPages = Math.max(1, Math.ceil(sortedInvoices.length / invoicesPerPage));
  const paginatedInvoices = useMemo(() => {
    const start = (invoicePage - 1) * invoicesPerPage;
    return sortedInvoices.slice(start, start + invoicesPerPage);
  }, [sortedInvoices, invoicePage, invoicesPerPage]);

  useEffect(() => {
    setInvoicePage(1);
  }, [invoiceSearchTerm, invoiceSortConfig, invoicesPerPage]);

  useEffect(() => {
    if (invoicePage > invoiceTotalPages) setInvoicePage(invoiceTotalPages);
  }, [invoiceTotalPages, invoicePage]);

  // Lock background scroll while a row-actions / column popup is open so the
  // page underneath can't move until the menu is dismissed.
  useEffect(() => {
    const menuOpen = openInvoiceActionsId != null || openInvoiceColMenuKey != null;
    if (!menuOpen) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [openInvoiceActionsId, openInvoiceColMenuKey]);

  const getInvoiceGhostPreview = (colId) =>
    (sortedInvoices || []).map((inv) => String(getInvoiceFieldValue(inv, colId) ?? "").trim() || "—");

  // Build the TanStack column defs for the Invoices table (selection + data
  // columns + per-column header menu with pin/sort/hide), grouped by pin side.
  const invoiceTableColumns = useMemo(() => {
    const cols = [];

    cols.push(
      invoiceColumnHelper.display({
        id: "selection",
        size: 60,
        enableResizing: false,
        header: () => (
          <div className="flex justify-center items-center w-full">
            <Checkbox checked={invoices.length > 0 && selectedInvoices.length === invoices.length} onChange={handleSelectAllInvoices}  uncheckedColor="text-[#525866]"/>
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex justify-center items-center w-full">
            <Checkbox checked={selectedInvoicesSet.has(row.original._id)} onChange={() => handleSelectInvoice(row.original._id)} />
          </div>
        ),
      }),
    );

    const leftPinnedKeys = invoicePinnedColumns.filter((p) => p.side === "left").map((p) => p.key);
    const rightPinnedKeys = invoicePinnedColumns.filter((p) => p.side === "right").map((p) => p.key);
    const leftFields = invoiceVisibleColumns.filter((vc) => leftPinnedKeys.includes(vc.key));
    const rightFields = invoiceVisibleColumns.filter((vc) => rightPinnedKeys.includes(vc.key));
    const unpinnedFields = invoiceVisibleColumns.filter(
      (vc) => !leftPinnedKeys.includes(vc.key) && !rightPinnedKeys.includes(vc.key),
    );
    const orderedFields = [...leftFields, ...unpinnedFields, ...rightFields];
    const lastColumnKey = orderedFields[orderedFields.length - 1]?.key;

    orderedFields.forEach((vc) => {
      cols.push(
        invoiceColumnHelper.accessor((row) => getInvoiceFieldValue(row, vc.key), {
          id: vc.key,
          size: vc.key === "invoiceId" || vc.key === "deal" ? 170 : 150,
          header: () => {
            const isSortable = vc.sortable !== false;
            const pinSide = getInvoicePinSide(vc.key);
            const isMenuOpen = openInvoiceColMenuKey === vc.key;
            return (
              <div className="flex items-center justify-between w-full group">
                <span className="truncate flex-1 min-w-0" title={vc.label}>{vc.label}</span>
                {invoiceSortConfig.key === vc.key && (invoiceSortConfig.direction === "asc"
                  ? <ArrowUp className="w-3 h-3 text-[#0085FF] flex-shrink-0" />
                  : <ArrowDown className="w-3 h-3 text-[#0085FF] flex-shrink-0" />)}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isMenuOpen) {
                      setOpenInvoiceColMenuKey(null);
                      setInvoiceColMenuPos(null);
                      return;
                    }
                    // rect is VISUAL px; the menu is portaled into document.body, which
                    // paints inside the dynamic <html> zoom, so rect-derived values must
                    // be divided by that zoom to line up with the trigger button.
                    const zMenu = getRootZoom();
                    const MENU_W = 190;
                    const rect = e.currentTarget.getBoundingClientRect();
                    let calcLeft = rect.right / zMenu - MENU_W;
                    calcLeft = Math.min(calcLeft, window.innerWidth / zMenu - MENU_W - 8);
                    calcLeft = Math.max(calcLeft, 8);
                    setInvoiceColMenuPos({ top: rect.bottom / zMenu + 4, left: calcLeft });
                    setOpenInvoiceColMenuKey(vc.key);
                  }}
                  className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-500 flex-shrink-0"
                  title="Column options"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {isMenuOpen && invoiceColMenuPos && createPortal(
                  <>
                    <div className="fixed inset-0 z-[9998]" onClick={() => { setOpenInvoiceColMenuKey(null); setInvoiceColMenuPos(null); }} />
                    <div
                      ref={invoiceColMenuRef}
                      style={{ position: "fixed", top: invoiceColMenuPos.top, left: invoiceColMenuPos.left }}
                      className="w-[190px] z-[9999] bg-white border border-[#E5E5EC] rounded-xl shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-2 flex flex-col gap-1 animate-in fade-in zoom-in duration-150 origin-top-right"
                    >
                      <button
                        onClick={() => {
                          setOpenInvoiceColMenuKey(null);
                          setInvoiceColMenuPos(null);
                          pinSide === "left" ? invoiceUnpinColumn(vc.key) : invoicePinColumnToSide(vc.key, "left");
                        }}
                        className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${pinSide === "left" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
                      >
                        {pinSide === "left" ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4 text-[#1C1B1F]" />}
                        Pin to Left
                      </button>
                      <button
                        onClick={() => {
                          setOpenInvoiceColMenuKey(null);
                          setInvoiceColMenuPos(null);
                          pinSide === "right" ? invoiceUnpinColumn(vc.key) : invoicePinColumnToSide(vc.key, "right");
                        }}
                        className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${pinSide === "right" ? "bg-blue-50 text-blue-700" : "text-[#161618] hover:bg-gray-50"}`}
                      >
                        {pinSide === "right" ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4 text-[#1C1B1F]" />}
                        Pin to Right
                      </button>

                      {isSortable && (
                        <>
                          <button
                            onClick={() => {
                              setOpenInvoiceColMenuKey(null);
                              setInvoiceColMenuPos(null);
                              handleInvoiceSort(vc.key, "asc");
                            }}
                            className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${invoiceSortConfig.key === vc.key && invoiceSortConfig.direction === "asc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                          >
                            <ChevronUp className="w-4 h-4 text-[#1C1B1F]" />
                            Sort Ascending
                          </button>
                          <button
                            onClick={() => {
                              setOpenInvoiceColMenuKey(null);
                              setInvoiceColMenuPos(null);
                              handleInvoiceSort(vc.key, "desc");
                            }}
                            className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${invoiceSortConfig.key === vc.key && invoiceSortConfig.direction === "desc" ? "bg-blue-50 text-blue-700 font-medium" : "text-[#161618] hover:bg-gray-50"}`}
                          >
                            <ChevronDown className="w-4 h-4 text-[#1C1B1F]" />
                            Sort Descending
                          </button>
                        </>
                      )}

                      <div className="w-full border-t border-[#F1F1F5] my-0.5" />

                      <button
                        onClick={() => {
                          setOpenInvoiceColMenuKey(null);
                          setInvoiceColMenuPos(null);
                          setInvoiceColumnsConfig((prev) =>
                            prev.map((c) => (c.key === vc.key ? { ...c, visible: false } : c)),
                          );
                        }}
                        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm font-semibold text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                      >
                        <EyeOff className="w-4 h-4 text-[#1C1B1F]" />
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
            const inv = row.original;
            let baseContent;

            if (vc.key === "invoiceId") {
              baseContent = (
                <span className="text-sm font-semibold text-[#1F2937] truncate block" title={inv.invoiceNumber}>
                  {inv.invoiceNumber ? <HighlightText text={inv.invoiceNumber} query={invoiceSearchTerm} /> : "—"}
                </span>
              );
            } else if (vc.key === "amount") {
              baseContent = (
                <span className="text-sm font-medium text-[#1F2937]">
                  {inv.amount != null ? (
                    <HighlightText text={`₹${Math.round(inv.amount).toLocaleString("en-IN")}`} query={invoiceSearchTerm} />
                  ) : (
                    "—"
                  )}
                </span>
              );
            } else if (vc.key === "status") {
              const isPaid = inv.status?.toLowerCase() === "paid" || inv.status?.toLowerCase() === "accepted";
              baseContent = (
                <span
                  className="inline-flex items-center justify-center px-3 py-[5px] rounded-full text-xs font-medium"
                  style={{
                    background: isPaid ? "rgba(0, 201, 80, 0.1)" : "rgba(254, 89, 25, 0.1)",
                    color: isPaid ? "#00C950" : "#FE5919",
                  }}
                >
                  {inv.status ? <HighlightText text={inv.status} query={invoiceSearchTerm} /> : "—"}
                </span>
              );
            } else {
              const val = String(getValue() ?? "").trim();
              baseContent = (
                <span className="text-sm text-gray-700 truncate block" title={val}>
                  {val ? <HighlightText text={val} query={invoiceSearchTerm} /> : "—"}
                </span>
              );
            }

            if (vc.key === lastColumnKey) {
              const isActionsOpen = openInvoiceActionsId === inv._id;
              return (
                <div className="flex items-center justify-between w-full gap-2">
                  <div className="min-w-0 flex-1">{baseContent}</div>
                  <div className="relative flex-shrink-0" onMouseDown={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isActionsOpen) {
                          setOpenInvoiceActionsId(null);
                          setInvoiceActionsPos(null);
                          return;
                        }
                        setInvoiceActionsPos({ top: e.clientY + 4, left: e.clientX - 190 });
                        setOpenInvoiceActionsId(inv._id);
                      }}
                      className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                      title="More actions"
                    >
                      <MoreIcon className="w-4 h-4" />
                    </button>
                    {isActionsOpen && invoiceActionsPos && createPortal(
                      <>
                        <div className="fixed inset-0 z-[9998]" onClick={() => { setOpenInvoiceActionsId(null); setInvoiceActionsPos(null); }} />
                        <div
                          ref={invoiceActionsRef}
                          style={{ position: "fixed", top: invoiceActionsPos.top, left: invoiceActionsPos.left }}
                          className="w-[190px] z-[9999] bg-white border border-[#E5E5EC] rounded-xl shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-2 flex flex-col gap-1 animate-in fade-in zoom-in duration-150 origin-top-right"
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenInvoiceActionsId(null);
                              setInvoiceActionsPos(null);
                              handleViewInvoice(inv);
                            }}
                            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm font-semibold text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                          >
                            <EyeIcon className="w-4 h-4 text-[#1C1B1F]" />
                            View Invoice
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenInvoiceActionsId(null);
                              setInvoiceActionsPos(null);
                              handleEditInvoice(inv);
                            }}
                            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm font-semibold text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                          >
                            <EditIcon className="w-4 h-4 text-[#1C1B1F]" />
                            Edit Invoice
                          </button>
                          <div className="w-full border-t border-[#F1F1F5] my-0.5" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenInvoiceActionsId(null);
                              setInvoiceActionsPos(null);
                              handleDeleteInvoice(inv);
                            }}
                            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 whitespace-nowrap"
                          >
                            <DeleteIcon className="w-4 h-4" />
                            Delete Invoice
                          </button>
                        </div>
                      </>,
                      document.body,
                    )}
                  </div>
                </div>
              );
            }
            return baseContent;
          },
        }),
      );
    });

    return cols;
  }, [
    invoices.length,
    selectedInvoices,
    selectedInvoicesSet,
    invoiceVisibleColumns,
    invoicePinnedColumns,
    invoiceSortConfig,
    openInvoiceColMenuKey,
    invoiceColMenuPos,
    openInvoiceActionsId,
    invoiceActionsPos,
    invoiceSearchTerm,
  ]);

  const [companies, setCompanies] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [totalClients, setTotalClients] = useState(0);
  const [totalContacts, setTotalContacts] = useState(0);
  const [activeDeals, setActiveDeals] = useState(0);
  const [totalTasks, setTotalTasks] = useState(0);
  const [totalMeetings, setTotalMeetings] = useState(0);

  const [averageDealSize, setAverageDealSize] = useState(0);
  // CRM Health card — every figure is measured from this org's own records.
  // A metric with nothing to measure reports 0 rather than a flattering
  // default, so an empty CRM reads as empty.
  const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

  const crmHealthMetrics = useMemo(() => {
    // Engagement: contacts that are actually attached to a deal, vs all of them.
    const contactIdsOnDeals = new Set(
      (deals || [])
        .map((d) => d.contact?._id || d.contact)
        .filter(Boolean)
        .map(String)
    );
    const engagedContacts = (contacts || []).filter((c) =>
      contactIdsOnDeals.has(String(c._id))
    ).length;

    // Tasks: completed vs every task on record.
    const completedTasks = (allTasks || []).filter(
      (t) => (t.status || "").toLowerCase() === "completed"
    ).length;

    // Deal activity: deals touched in the last 30 days vs all deals — a
    // pipeline nobody has updated is the thing this is meant to surface.
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - THIRTY_DAYS;
    const activeDeals = (deals || []).filter((d) => {
      const t = new Date(d.updatedAt || d.createdAt || 0).getTime();
      return t >= cutoff;
    }).length;

    // Meetings: only those already due are judged — a meeting scheduled for
    // next week isn't "incomplete", it just hasn't happened.
    const pastMeetings = (allMeetings || []).filter(
      (m) => m.scheduledAt && new Date(m.scheduledAt).getTime() <= Date.now()
    );
    const completedMeetings = pastMeetings.filter(
      (m) => (m.status || "").toLowerCase() === "completed"
    ).length;

    return [
      { label: "Contact Engagement", value: pct(engagedContacts, (contacts || []).length) },
      { label: "Task Completion", value: pct(completedTasks, (allTasks || []).length) },
      { label: "Deal Activity", value: pct(activeDeals, (deals || []).length) },
      { label: "Meeting Completion", value: pct(completedMeetings, pastMeetings.length) },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, deals, allTasks, allMeetings]);

  // Pipeline Snapshot (Card Two). Deal has amount, status and timestamps —
  // no close-date field — so every figure below is derived from those three.
  const pipelineSnapshot = useMemo(() => {
    const all = deals || [];
    const sum = (list) => list.reduce((t, d) => t + (d.amount || 0), 0);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const at = (d) => new Date(d.updatedAt || d.createdAt || 0).getTime();
    const isStatus = (d, st) => (d.status || "Open").toLowerCase() === st;

    const open = all.filter((d) => isStatus(d, "open"));
    const wonThis = all.filter((d) => isStatus(d, "won") && at(d) >= monthStart);
    const wonPrev = all.filter((d) => isStatus(d, "won") && at(d) >= prevMonthStart && at(d) < monthStart);
    const lostThis = all.filter((d) => isStatus(d, "lost") && at(d) >= monthStart);
    const lostPrev = all.filter((d) => isStatus(d, "lost") && at(d) >= prevMonthStart && at(d) < monthStart);
    const activeWeek = open.filter((d) => at(d) >= weekAgo);

    const change = (current, previous) => {
      if (previous > 0) return Math.round(((current - previous) / previous) * 100);
      return current > 0 ? 100 : 0;
    };

    const openPrev = sum(all.filter((d) => isStatus(d, "open") && at(d) < monthStart));

    return [
      { label: "Pipeline Value", value: sum(open), delta: change(sum(open), openPrev) },
      { label: "Won this Month", value: sum(wonThis), delta: change(sum(wonThis), sum(wonPrev)) },
      { label: "Lost", value: sum(lostThis), delta: change(sum(lostThis), sum(lostPrev)), invert: true },
      // The design says "Closing this Week", but there is no expected-close
      // date on a deal to compute that from. This is the honest equivalent
      // the data supports: open deals touched in the last seven days.
      { label: "Active this Week", value: sum(activeWeek), delta: change(sum(activeWeek), 0) },
    ];
  }, [deals]);

  // Eight monthly buckets for the card's chart: value created vs value won.
  const pipelineTrendData = useMemo(() => {
    const months = Array.from({ length: 8 }, (_, i) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - (7 - i));
      return {
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString("en-IN", { month: "short" }),
        pipeline: 0,
        won: 0,
      };
    });
    const index = new Map(months.map((m, i) => [m.key, i]));
    (deals || []).forEach((d) => {
      const created = new Date(d.createdAt || d.updatedAt || 0);
      const ci = index.get(`${created.getFullYear()}-${created.getMonth()}`);
      if (ci !== undefined) months[ci].pipeline += d.amount || 0;
      if ((d.status || "").toLowerCase() === "won") {
        const closed = new Date(d.updatedAt || d.createdAt || 0);
        const wi = index.get(`${closed.getFullYear()}-${closed.getMonth()}`);
        if (wi !== undefined) months[wi].won += d.amount || 0;
      }
    });
    return months;
  }, [deals]);

  const crmHealthScore = Math.round(
    crmHealthMetrics.reduce((sum, m) => sum + m.value, 0) / crmHealthMetrics.length
  );
  const crmHealthLabel =
    crmHealthScore >= 85
      ? "Excellent"
      : crmHealthScore >= 70
      ? "Good"
      : crmHealthScore >= 50
      ? "Fair"
      : "Needs work";

  // Drafts still to send. The banner below was hardcoded to "2 invoices" and
  // rendered unconditionally, with dead Dismiss/View buttons.
  const draftInvoices = useMemo(
    () => (invoices || []).filter((inv) => (inv.status || "").toLowerCase() === "draft"),
    [invoices]
  );
  const [draftNoticeDismissed, setDraftNoticeDismissed] = useState(
    () => localStorage.getItem("dashboardDraftNoticeDismissed") === "true"
  );

  // A dismissal silences the drafts you had at the time, not every future
  // one: when the count rises, or drops to zero, the notice resets.
  useEffect(() => {
    const seen = Number(localStorage.getItem("dashboardDraftNoticeCount") || 0);
    if (draftInvoices.length === 0) {
      localStorage.removeItem("dashboardDraftNoticeDismissed");
      localStorage.removeItem("dashboardDraftNoticeCount");
      setDraftNoticeDismissed(false);
      return;
    }
    if (draftInvoices.length > seen) {
      localStorage.removeItem("dashboardDraftNoticeDismissed");
      setDraftNoticeDismissed(false);
    }
    localStorage.setItem("dashboardDraftNoticeCount", String(draftInvoices.length));
  }, [draftInvoices.length]);

  const [invoiceStats, setInvoiceStats] = useState({
    delivered: 0,
    sent: 0,
    accepted: 0,
    due: 0,
    total: 0,
  });

  // Stable loading message (no re-renders)
  const loadingMessage = useMemo(() => {
    const messages = [
      "Gathering your business insights...",
      "Loading your CRM dashboard...",
      "Preparing your sales overview...",
      "Crunching client data for you...",
      "Setting up your success metrics...",
      "Fetching deals and tasks...",
      "Building your business snapshot...",
      "Syncing your customer pipeline...",
      "Organizing your dashboard data...",
      "Your CRM command center is loading...",
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }, []);

  // --------------- Utility Functions ------------------
  const calculateAverageDealAmount = (deals) => {
    if (!Array.isArray(deals) || deals.length === 0) return 0;
    const total = deals.reduce((sum, d) => sum + (d.amount || 0), 0);
    return total / deals.length;
  };

  const calculateInvoiceStats = (invoices) => {
    const stats = { delivered: 0, sent: 0, accepted: 0, due: 0, total: 0 };
    const today = new Date();

    invoices?.forEach((invoice) => {
      const amount = invoice.amount || 0;
      const status = invoice.status?.toLowerCase();

      if (status === "delivered") stats.delivered += amount;
      if (status === "sent") stats.sent += amount;
      if (status === "accepted") stats.accepted += amount;

      if (status !== "accepted" && invoice.dueDate && new Date(invoice.dueDate) < today) {
        stats.due += amount;
      }
    });

    stats.total = stats.delivered + stats.sent + stats.accepted;
    return stats;
  };

  // ---------------- Greeting & Subtitle ----------------
  const friendlyGreeting = useMemo(() => {
    const hour = new Date().getHours();
    const firstName = (user?.name || "there").split(" ")[0];
    const isWeekend = [0, 6].includes(new Date().getDay());

    const sets = {
      weekend: [
        `Weekend warrior, ${firstName}!`,
        `Hey ${firstName}! Working on the weekend?`,
        `Weekend vibes, ${firstName}!`,
      ],
      morning: [
        `Good morning, ${firstName}!`,
        `Rise and shine, ${firstName}!`,
        `Morning, ${firstName}! Ready to crush today?`,
      ],
      afternoon: [
        `Good afternoon, ${firstName}!`,
        `Hey ${firstName}, hope your day is productive!`,
      ],
      evening: [
        `Good evening, ${firstName}!`,
        `Evening, ${firstName}! Still going strong?`,
      ],
      night: [
        `Burning the midnight oil, ${firstName}?`,
        `Late night hustle, ${firstName}? Impressive!`,
      ],
    };

    if (isWeekend)
      return sets.weekend[Math.floor(Math.random() * sets.weekend.length)];

    if (hour < 12)
      return sets.morning[Math.floor(Math.random() * sets.morning.length)];
    if (hour < 17)
      return sets.afternoon[Math.floor(Math.random() * sets.afternoon.length)];
    if (hour < 22)
      return sets.evening[Math.floor(Math.random() * sets.evening.length)];

    return sets.night[Math.floor(Math.random() * sets.night.length)];
  }, [user]);

  const motivationalSubtitle = useMemo(() => {
    const subtitles = [
      "Let's see what's on your plate today",
      "Here's your business snapshot",
      "Time to make things happen",
      "Your success dashboard awaits",
      "Let's dive into your metrics",
    ];
    return subtitles[Math.floor(Math.random() * subtitles.length)];
  }, []);

  const summaryStats = useMemo(() => {
    const wonDeals = deals.filter(d => d.status === "Won");
    const closedCount = wonDeals.length;
    const revenueSum = wonDeals.reduce((sum, d) => sum + (d.amount || 0), 0);

    // Revenue section summary stats (for PaymentInformation)
    const allInvoices = invoices || [];
    const totalIssued = allInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
    const totalPaidSum = allInvoices
      .filter((inv) => inv.status?.toLowerCase() === "paid" || inv.status?.toLowerCase() === "accepted")
      .reduce((sum, inv) => sum + (inv.amount || 0), 0);
    const totalUnpaid = totalIssued - totalPaidSum;

    // Monthly deal value (all deals created this month)
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthlyValue = deals
      .filter(d => {
        const date = new Date(d.createdAt);
        return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
      })
      .reduce((sum, d) => sum + (d.amount || 0), 0);

    return {
      closedDeals: closedCount || 0,
      revenue: revenueSum || 0,
      monthlyDealValue: monthlyValue || 0,
      revenueSummary: {
        totalIssued: totalIssued || 0,
        totalPaid: totalPaidSum || 0,
        totalUnpaid: totalUnpaid || 0,
      }
    };
  }, [deals, invoices]);

  // Compares "this month" vs "last month" totals for a list of items and returns % change + direction
  const getMonthOverMonthChange = (items, dateField, valueField) => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const lastMonthDate = new Date(thisYear, thisMonth - 1, 1);
    const lastMonth = lastMonthDate.getMonth();
    const lastMonthYear = lastMonthDate.getFullYear();

    let current = 0;
    let previous = 0;

    (items || []).forEach((item) => {
      const raw = item[dateField];
      if (!raw) return;
      const d = new Date(raw);
      if (isNaN(d)) return;
      const val = valueField ? item[valueField] || 0 : 1;

      if (d.getMonth() === thisMonth && d.getFullYear() === thisYear) current += val;
      else if (d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear) previous += val;
    });

    if (previous === 0) {
      return { current, previous, pct: current > 0 ? 100 : 0, up: true };
    }
    const change = ((current - previous) / previous) * 100;
    return { current, previous, pct: Math.abs(Math.round(change)), up: change >= 0 };
  };

  const overviewKpis = useMemo(() => {
    const wonDeals = deals.filter((d) => d.status === "Won");
    const paidInvoices = invoices.filter((inv) => inv.status?.toLowerCase() === "paid" || inv.status?.toLowerCase() === "accepted");

    const totalIncomeTrend = getMonthOverMonthChange(invoices, "date", "amount");
    const revenueGeneratedTrend = getMonthOverMonthChange(paidInvoices, "date", "amount");
    const dealsClosedTrend = getMonthOverMonthChange(wonDeals, "createdAt", null);
    const dealValueTrend = getMonthOverMonthChange(wonDeals, "createdAt", "amount");

    return {
      totalIncome: invoices.reduce((sum, inv) => sum + (inv.amount || 0), 0),
      totalIncomeTrend,
      revenueGenerated: paidInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0),
      revenueGeneratedTrend,
      dealsClosedCount: wonDeals.length,
      dealsClosedTrend,
      dealValue: wonDeals.reduce((sum, d) => sum + (d.amount || 0), 0),
      dealValueTrend,
    };
  }, [deals, invoices]);

  // "Earnings Performance" widget — revenue (paid invoices) + profit (won deals)
  // for the selected quarter of the current year, plus the quarter-over-quarter change.
  const quarterlyEarnings = useMemo(() => {
    const qIndex = { Q1: 0, Q2: 1, Q3: 2, Q4: 3 }[selectedQuarter];
    const year = new Date().getFullYear();
    const inQuarter = (dateStr, q, yr) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (isNaN(d)) return false;
      return Math.floor(d.getMonth() / 3) === q && d.getFullYear() === yr;
    };
    const revenueFor = (q, yr) =>
      (invoices || [])
        .filter((inv) => (inv.status?.toLowerCase() === "paid" || inv.status?.toLowerCase() === "accepted") && inQuarter(inv.date, q, yr))
        .reduce((sum, inv) => sum + (inv.amount || 0), 0);
    const profitFor = (q, yr) =>
      (deals || [])
        .filter((d) => d.status === "Won" && inQuarter(d.createdAt, q, yr))
        .reduce((sum, d) => sum + (d.amount || 0), 0);

    const revenue = revenueFor(qIndex, year);
    const profit = profitFor(qIndex, year);
    const total = revenue + profit;

    const prevQIndex = qIndex === 0 ? 3 : qIndex - 1;
    const prevYear = qIndex === 0 ? year - 1 : year;
    const prevTotal = revenueFor(prevQIndex, prevYear) + profitFor(prevQIndex, prevYear);
    const pctChange = prevTotal === 0 ? (total > 0 ? 100 : 0) : Math.round(((total - prevTotal) / prevTotal) * 100);

    const scoreBasis = Math.max(total, 1);
    const revenueScore = Math.round((revenue / scoreBasis) * 100) / 10;
    const profitScore = Math.round((profit / scoreBasis) * 100) / 10;

    return { revenue, profit, total, pctChange, revenueScore, profitScore };
  }, [deals, invoices, selectedQuarter]);

  // "Recent Deals" widget — highest-value deal + most recently created deals
  const recentDealsWidget = useMemo(() => {
    const list = deals || [];
    const topDeal = [...list].sort((a, b) => (b.amount || 0) - (a.amount || 0))[0] || null;
    const recent = [...list]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 6)
      .map((d) => ({
        client: d.company?.name || d.contact?.name || "—",
        deal: d.title || "Untitled Deal",
        amount: `${Math.round(d.amount || 0).toLocaleString("en-IN")} INR`,
      }));
    return { topDeal, recent };
  }, [deals]);

  const invoiceKpiTrends = useMemo(() => {
    const paidInvoices = invoices.filter((inv) => inv.status?.toLowerCase() === "paid" || inv.status?.toLowerCase() === "accepted");
    const pendingInvoices = invoices.filter((inv) => inv.status?.toLowerCase() === "sent" || inv.status?.toLowerCase() === "pending");
    const today = new Date();
    const dueInvoices = invoices.filter(
      (inv) => !(inv.status?.toLowerCase() === "paid" || inv.status?.toLowerCase() === "accepted") && inv.dueDate && new Date(inv.dueDate) < today
    );

    return {
      total: getMonthOverMonthChange(invoices, "date", "amount"),
      paid: getMonthOverMonthChange(paidInvoices, "date", "amount"),
      pending: getMonthOverMonthChange(pendingInvoices, "date", "amount"),
      due: getMonthOverMonthChange(dueInvoices, "dueDate", "amount"),
    };
  }, [invoices]);

  // "Total Invoices Issued" card — top client (by invoiced amount) summary +
  // last-7-months paid-amount trend for the sparkline underneath it.
  const totalInvoicesCard = useMemo(() => {
    const clearedPct = invoiceStats.total > 0
      ? Math.round((invoiceStats.accepted / invoiceStats.total) * 100)
      : 0;

    const dealsById = {};
    (deals || []).forEach((d) => { dealsById[d._id] = d; });

    const byCompany = {};
    invoices.forEach((inv) => {
      const dealId = inv.deal?._id || inv.deal;
      const fullDeal = dealsById[dealId];
      const companyName = fullDeal?.company?.name || inv.deal?.company?.name;
      if (!companyName) return;
      const isPaid = inv.status?.toLowerCase() === "accepted";
      if (!byCompany[companyName]) {
        byCompany[companyName] = { companyName, dealTitle: "", total: 0, paidAmount: 0, count: 0, paidCount: 0 };
      }
      const entry = byCompany[companyName];
      entry.total += inv.amount || 0;
      entry.count += 1;
      if (isPaid) {
        entry.paidAmount += inv.amount || 0;
        entry.paidCount += 1;
      }
      entry.dealTitle = inv.deal?.title || fullDeal?.title || entry.dealTitle;
    });
    const topClient = Object.values(byCompany).sort((a, b) => b.total - a.total)[0] || null;
    const topClientPct = topClient && topClient.total > 0
      ? Math.round((topClient.paidAmount / topClient.total) * 100)
      : 0;

    const months = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, month: d.toLocaleDateString("en-US", { month: "short" }), amount: 0 });
    }
    invoices.forEach((inv) => {
      if (inv.status?.toLowerCase() !== "accepted") return;
      const date = inv.date || inv.createdAt;
      if (!date) return;
      const d = new Date(date);
      const bucket = months.find((m) => m.key === `${d.getFullYear()}-${d.getMonth()}`);
      if (bucket) bucket.amount += inv.amount || 0;
    });
    const maxAmount = Math.max(1, ...months.map((m) => m.amount));
    const xStep = 362 / (months.length - 1);
    const points = months.map((m, i) => ({
      x: 1 + i * xStep,
      y: 119 - (m.amount / maxAmount) * 117,
    }));
    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

    return { clearedPct, topClient, topClientPct, points, linePath, months: months.map((m) => m.month) };
  }, [invoices, deals, invoiceStats]);

  // Sales Revenue widget — 100 evenly-spaced points across the last 12 months,
  // built entirely from this org's own invoices (no fabricated baseline/noise —
  // a org with no invoices yet sees a flat line at 0, not a fake growth curve).
  const monthlySalesRevenueData = useMemo(() => {
    const pointCount = 100;
    const totalDays = 365;
    const now = new Date();
    const startTime = now.getTime() - totalDays * 24 * 60 * 60 * 1000;
    const msPerPoint = (totalDays * 24 * 60 * 60 * 1000) / (pointCount - 1);

    const points = Array.from({ length: pointCount }, (_, i) => {
      const d = new Date(startTime + i * msPerPoint);
      return {
        date: d,
        month: d.toLocaleDateString("en-US", { day: "2-digit", month: "short" }),
        revenue: 0,
      };
    });

    invoices.forEach((inv) => {
      const date = inv.date || inv.createdAt;
      if (!date) return;
      const t = new Date(date).getTime();
      if (t < startTime || t > now.getTime()) return;
      const idx = Math.min(pointCount - 1, Math.max(0, Math.round((t - startTime) / msPerPoint)));
      points[idx].revenue += inv.amount || 0;
    });

    // Trend line: a real trailing moving average of this org's own revenue
    // (not a decorative shape) — smooths the day-to-day spikes so the actual
    // direction of the business is visible alongside the raw daily total.
    const windowSize = 10;
    let windowSum = 0;
    points.forEach((p, i) => {
      windowSum += p.revenue;
      if (i >= windowSize) windowSum -= points[i - windowSize].revenue;
      const count = Math.min(i + 1, windowSize);
      p.trendRevenue = windowSum / count;
    });

    return points;
  }, [invoices]);

  const salesRevenueYMax = useMemo(() => {
    const max = Math.max(0, ...monthlySalesRevenueData.map((m) => m.revenue));
    if (max === 0) return 100;
    const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
    return Math.ceil(max / magnitude) * magnitude;
  }, [monthlySalesRevenueData]);

  // Only show one tick per calendar month on the X-axis, even though the underlying data is daily.
  const salesRevenueMonthTicks = useMemo(() => {
    const ticks = [];
    let lastMonthKey = null;
    monthlySalesRevenueData.forEach((p) => {
      const monthKey = `${p.date.getFullYear()}-${p.date.getMonth()}`;
      if (monthKey !== lastMonthKey) {
        ticks.push(p.month);
        lastMonthKey = monthKey;
      }
    });
    return ticks;
  }, [monthlySalesRevenueData]);

  const formatSalesRevenueMonthTick = (value) => value.split(" ")[0] || value;

  // Default the Sales Revenue plot to showing the current year (rightmost 12 months);
  // older years are still reachable by scrolling left.
  useEffect(() => {
    if (!loading && salesRevenueScrollRef.current) {
      salesRevenueScrollRef.current.scrollLeft = salesRevenueScrollRef.current.scrollWidth;
    }
  }, [loading, monthlySalesRevenueData, isMobileViewport]);

  // ------------------- Auth Check ---------------------
  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));

    if (!storedUser) {
      return navigate("/login");
    }

    // Remove the admin restriction
    setUser(storedUser);
  }, [navigate]);

  // ------------------- Data Fetching -------------------
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);

        // const [
        //   companiesRes,
        //   contactsRes,
        //   dealsRes,
        //   tasksRes,
        //   invoicesRes,
        //   meetingRes,
        // ] = await Promise.all([
        //   API.get("/companies"),
        //   API.get("/contacts"),
        //   API.get("/deals"),
        //   API.get("/tasks/admin"),
        //   API.get("/invoices"),
        //   API.get("/meetings/all-meetings"),
        // ]);

        const [
          companiesRes,
          contactsRes,
          dealsRes,
          tasksRes,
          invoicesRes,
          meetingRes,
        ] = await Promise.all([
          API.get("/companies"),
          API.get("/contacts"),
          API.get("/deals/dashboard-deals"),
          API.get("/tasks"), // ⬅️ staff can now access this
          API.get("/invoices"), // ⬅️ filtered automatically
          API.get("/meetings/dashboard"), // ⬅️ staff gets own meetings
        ]);

        const allInvoices = invoicesRes.data;

        setDeals(dealsRes.data);
        setCompanies(companiesRes.data);
        setContacts(contactsRes.data);
        setTotalClients(companiesRes.data.length);
        setTotalContacts(contactsRes.data.length);
        setActiveDeals(dealsRes.data.filter((d) => d.status === "Open").length);

        const allTasksData = tasksRes.data;
        setTasks(
          allTasksData.filter((t) => t.status === "Pending").slice(0, 3)
        );
        setAllTasks(allTasksData);
        setTotalTasks(allTasksData.length);

        setAllMeetings(meetingRes.data);
        setMeetings(meetingRes.data.slice(0, 3));
        setTotalMeetings(meetingRes.data.length);

        setInvoices(allInvoices);
        setAverageDealSize(calculateAverageDealAmount(dealsRes.data));
        setInvoiceStats(calculateInvoiceStats(allInvoices));
      } catch (err) {
        console.log(err);
        if (err.response?.data?.code == "NO_SUBSCRIPTION") {
          navigate("/subscription");
        }
        console.error("Dashboard error:", err);
        setError("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [navigate]);

  // ------------------- Loading UI -------------------
  // if (loading) {
  //   return (
  //     <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-100 z-[10000]">
  //       <img
  //         src={logo}
  //         alt="Loading..."
  //         className="animate-spin drop-shadow-lg"
  //         style={{
  //           width: 48,
  //           height: 48,
  //           animationDuration: "1.8s",
  //           filter: "invert(100%)",
  //         }}
  //       />
  //       <p className="mt-3 text-gray-600 font-medium">{loadingMessage}</p>
  //     </div>
  //   );
  // }

  // ------------------- Error UI -------------------
  if (error) {
    return <div></div>;
  }

  // ------------------- CRM tab (empty for now) -------------------
  if (activeDashboardTab === "CRM") {
    const pendingTasksCount = allTasks.filter((t) => t.status === "Pending").length;
    const meetingsTodayCount = allMeetings.filter((m) => {
      if (!m.scheduledAt) return false;
      const d = new Date(m.scheduledAt);
      const now = new Date();
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    }).length;

    const pendingTasks = allTasks.filter((t) => t.status === "Pending");
    const companiesTrend = getMonthOverMonthChange(companies, "createdAt", null);
    const contactsTrend = getMonthOverMonthChange(contacts, "createdAt", null);
    const meetingsTrend = getMonthOverMonthChange(allMeetings, "scheduledAt", null);
    const pendingTasksTrend = getMonthOverMonthChange(pendingTasks, "createdAt", null);

    const crmKpis = [
      { icon: Building2, label: "Total Companies", value: totalClients, trend: `${companiesTrend.pct}% this month`, trendUp: companiesTrend.up },
      { icon: Users, label: "Total Contacts", value: totalContacts, trend: `${contactsTrend.pct}% this month`, trendUp: contactsTrend.up },
      { icon: VideoIcon, label: "Meetings Today", value: meetingsTodayCount, trend: `${meetingsTrend.pct}% this month`, trendUp: meetingsTrend.up },
      { icon: ListChecks, label: "Pending Tasks", value: pendingTasksCount, trend: `${pendingTasksTrend.pct}% this month`, trendUp: pendingTasksTrend.up },
    ];

    return (
      <div style={{ marginTop: -16 }}>
        <div
          className="box-border flex flex-row justify-between items-center h-[72px] min-h-[72px] max-h-[72px] px-4 sm:px-6 lg:px-8 py-3 top-[calc(54px+var(--dc-offline-offset,0px))] lg:h-16 lg:min-h-16 lg:max-h-16 lg:py-0 lg:top-[calc(64px+var(--dc-offline-offset,0px))]"
          style={{
            position: "fixed",
            left: "var(--sidebar-width, 0px)",
            right: 0,
            zIndex: 40,
            gap: 16,
            background: "#FFFFFF",
            borderBottom: "1px solid #E1E4EA",
            boxSizing: "border-box",
          }}
        >
          <DashboardTabSwitcher />
        </div>
        {/* Spacer to offset the fixed header bar */}
        <div className="h-[72px] lg:h-16" />

        {/* KPI row: Companies / Contacts / Meetings Today / Pending Tasks —
            same card shape (icon + label/value + bottom-right trend badge)
            as the Overview tab's KPI row. */}
        <div
          className="grid grid-cols-2 gap-3 lg:flex lg:flex-row lg:items-stretch lg:gap-4 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8"
          style={{ marginTop: 24 }}
        >
          {crmKpis.map((kpi, i) => (
            <StatTile
              key={i}
              tile={{
                ...kpi,
                subtitle: kpi.trend,
                subtitleIcon: kpi.trendUp ? TrendingUp : TrendingDown,
                subtitleColor: kpi.trendUp ? "#00C950" : "#E82222",
              }}
            />
          ))}
        </div>

        {/* Same full-bleed rule that closes the KPI row on the other tabs. */}
        <div
          className="-mx-4 sm:-mx-6 lg:-mx-8"
          style={{ marginTop: 24, borderBottom: "1px solid #E1E4EA" }}
        />

        {/* Card row. Card One is the health gauge + engagement bars from the
            design; Card Two is still a shell awaiting its content. */}
        <div className="flex flex-col lg:flex-row" style={{ gap: 16, marginTop: 24 }}>
          {/* Two cards on a 2:3 split - the second absorbed the width of the
              old third card, with the first given a little back so it isn't
              squeezed to a third of the row. */}
          <div
            className="box-border flex flex-col items-start min-w-0 w-full lg:basis-0"
            style={{
              padding: 18,
              gap: 16,
              height: 320,
              flexGrow: 2,
              background: "#FFFFFF",
              border: "1px solid #E1E4EA",
              borderRadius: 12,
            }}
          >
            <span
              className="self-stretch"
              style={{ fontFamily: "'Inter Tight', Inter, sans-serif", fontWeight: 500, fontSize: 14, lineHeight: "120%", color: "#1F2937", opacity: 0.7 }}
            >
              CRM Health
            </span>

            {/* Chart Content: gauge on the left, metric bars on the right. */}
            <div
              className="flex flex-col sm:flex-row items-center self-stretch min-w-0"
              style={{ gap: 24, flex: 1 }}
            >
              <div className="flex items-center justify-center min-w-0" style={{ flex: 1, alignSelf: "stretch" }}>
                <CrmHealthGauge value={crmHealthScore} label={crmHealthLabel} />
              </div>

              {/* Shares the row with the gauge instead of being a fixed 181px
                  block pinned to the card's edge: it grows with the card, but
                  is capped so the bars don't stretch into a thin line on a
                  wide screen. */}
              <div
                className="flex flex-col justify-center min-w-0"
                style={{ gap: 16, flex: 1, maxWidth: 260 }}
              >
                {crmHealthMetrics.map((m) => (
                  <div key={m.label} className="flex flex-col items-start self-stretch" style={{ gap: 9 }}>
                    <span
                      className="self-stretch truncate"
                      style={{ fontFamily: "'Inter Tight', Inter, sans-serif", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#525252" }}
                    >
                      {m.label}
                    </span>
                    <div className="flex flex-row items-center self-stretch" style={{ gap: 9 }}>
                      <div
                        className="relative flex-1 min-w-0"
                        style={{ height: 4, background: "rgba(0, 133, 255, 0.1)", borderRadius: 999 }}
                      >
                        <div
                          className="absolute left-0 top-0"
                          style={{ width: `${Math.min(100, Math.max(0, m.value))}%`, height: 4, background: "#0085FF", borderRadius: 999 }}
                        />
                      </div>
                      <span
                        className="flex-shrink-0 text-right"
                        style={{ width: 34, fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#1F2937" }}
                      >
                        {m.value}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div
            className="box-border flex flex-col items-start min-w-0 w-full lg:basis-0"
            style={{
              padding: 18,
              gap: 16,
              height: 320,
              flexGrow: 3,
              background: "#FFFFFF",
              border: "1px solid #E1E4EA",
              borderRadius: 12,
            }}
          >
            <span
              className="self-stretch"
              style={{ fontFamily: "'Inter Tight', Inter, sans-serif", fontWeight: 500, fontSize: 14, lineHeight: "120%", color: "#1F2937", opacity: 0.7 }}
            >
              Pipeline Snapshot
            </span>

            {/* Metric strip: four figures separated by vertical rules, each
                with its own month-over-month delta. */}
            <div className="flex flex-col self-stretch" style={{ gap: 12 }}>
              <div className="self-stretch" style={{ height: 1, background: "#1F2937", opacity: 0.1 }} />

              <div className="flex flex-row items-stretch self-stretch" style={{ gap: 8, height: 40 }}>
                {pipelineSnapshot.map((m, i) => {
                  // "Lost" going up is bad news, so its arrow and colour are
                  // inverted rather than painting any rise green.
                  const good = m.invert ? m.delta <= 0 : m.delta >= 0;
                  const colour = good ? "#00C950" : "#F60000";
                  return (
                    <Fragment key={m.label}>
                      {i > 0 && (
                        <div style={{ width: 1, alignSelf: "stretch", background: "rgba(31, 41, 55, 0.3)" }} />
                      )}
                      <div className="flex flex-row justify-between items-end min-w-0" style={{ flex: 1, gap: 4 }}>
                        <div className="flex flex-col items-start min-w-0" style={{ gap: 4 }}>
                          <span
                            className="truncate"
                            style={{ fontFamily: "'Inter Tight', Inter, sans-serif", fontWeight: 400, fontSize: 12, lineHeight: "120%", color: "#525866" }}
                          >
                            {m.label}
                          </span>
                          <span
                            className="whitespace-nowrap"
                            style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 18, lineHeight: "120%", color: "#0E121B" }}
                          >
                            ₹{formatNumberToIndian(Math.round(m.value))}
                          </span>
                        </div>
                        <div className="flex flex-row items-center flex-shrink-0" style={{ gap: 4 }}>
                          {m.delta >= 0 ? (
                            <TrendingUp size={12} style={{ color: colour }} />
                          ) : (
                            <TrendingDown size={12} style={{ color: colour }} />
                          )}
                          <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 10, lineHeight: "120%", color: colour }}>
                            {Math.abs(m.delta)}%
                          </span>
                        </div>
                      </div>
                    </Fragment>
                  );
                })}
              </div>

              <div className="self-stretch" style={{ height: 1, background: "#1F2937", opacity: 0.1 }} />
            </div>

            {/* Created vs won value, last 8 months. */}
            <div className="self-stretch min-w-0" style={{ flex: 1 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={pipelineTrendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(31, 41, 55, 0.1)" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={{ stroke: "rgba(31, 41, 55, 0.3)" }}
                    tick={{ fontSize: 10, fontFamily: "Inter", fill: "#1F2937" }}
                  />
                  <YAxis
                    tickFormatter={formatCompactRupee}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tick={{ fontSize: 10, fontFamily: "Inter", fill: "#1F2937" }}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      `₹${formatNumberToIndian(Math.round(value || 0))}`,
                      name === "pipeline" ? "Created" : "Won",
                    ]}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #E1E4EA",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                      fontFamily: "Inter",
                      fontSize: 12,
                    }}
                  />
                  <Line type="monotone" dataKey="pipeline" stroke="#0085FF" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="won" stroke="#0AA43E" strokeWidth={2} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ------------------- Invoices tab -------------------
  if (activeDashboardTab === "Invoices") {
    return (
      <div style={{ marginTop: -16 }}>
        <div
          className="box-border flex flex-row justify-between items-center px-4 sm:px-6 lg:px-8"
          style={{
            position: "fixed",
            top: 64,
            left: "var(--sidebar-width, 0px)",
            right: 0,
            zIndex: 40,
            gap: 16,
            height: 64,
            minHeight: 64,
            maxHeight: 64,
            background: "#FFFFFF",
            borderBottom: "1px solid #E1E4EA",
            boxSizing: "border-box",
          }}
        >
          <DashboardTabSwitcher />
        </div>
        {/* Spacer to offset the fixed header bar */}
        <div style={{ height: 64 }} />

        {/* KPI Cards */}
        <div
          className="flex flex-row items-stretch -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8"
          style={{ gap: 16, marginTop: 24 }}
        >
          {[
            { icon: TotalIncomeIcon, label: "Total Invoices Issued", value: `₹${Math.round(invoiceStats.total).toLocaleString("en-IN")}`, trend: `${invoiceKpiTrends.total.pct}% this month`, trendUp: invoiceKpiTrends.total.up },
            { icon: RevenueGeneratedIcon, label: "Paid Invoices", value: `₹${Math.round(invoiceStats.accepted).toLocaleString("en-IN")}`, trend: `${invoiceKpiTrends.paid.pct}% this month`, trendUp: invoiceKpiTrends.paid.up },
            { icon: TotalDealsClosedIcon, label: "Pending Invoices", value: `₹${Math.round(invoiceStats.sent).toLocaleString("en-IN")}`, trend: `${invoiceKpiTrends.pending.pct}% this month`, trendUp: invoiceKpiTrends.pending.up },
            { icon: DealValueOvertimeIcon, label: "Due Invoices", value: `₹${Math.round(invoiceStats.due).toLocaleString("en-IN")}`, trend: `${invoiceKpiTrends.due.pct}% this month`, trendUp: invoiceKpiTrends.due.up },
          ].map((kpi, i) => (
            loading ? (
              <StatTileSkeleton key={i} subtitle />
            ) : (
              <StatTile
                key={i}
                tile={{
                  ...kpi,
                  subtitle: kpi.trend,
                  subtitleIcon: kpi.trendUp ? TrendingUp : TrendingDown,
                  subtitleColor: kpi.trendUp ? "#00C950" : "#E82222",
                }}
              />
            )
          ))}
        </div>

        {/* Only when there are actually drafts to send, and only until the
            user dismisses it. */}
        {draftInvoices.length > 0 && !draftNoticeDismissed && (
        <div
          className="box-border flex flex-row items-center self-stretch"
          style={{ padding: 12, gap: 16, marginTop: 24, background: "rgba(0, 133, 255, 0.1)", border: "1px solid rgba(0, 133, 255, 0.2)", borderRadius: 8 }}
        >
          <div className="flex flex-row justify-end items-center flex-1 self-stretch" style={{ gap: 12 }}>
            <div
              className="flex flex-row items-center flex-shrink-0"
              style={{ padding: 8, gap: 10, width: 36, height: 36, background: "#FFFFFF", borderRadius: 8 }}
            >
              <InvoicesIcon size={20} style={{ color: "#0085FF" }} />
            </div>

            <div className="flex flex-col items-start flex-1" style={{ gap: 6, height: 40 }}>
              <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#0085FF" }}>
                {draftInvoices.length} Invoice{draftInvoices.length === 1 ? "" : "s"} Awaiting To Send
              </span>
              <span className="self-stretch" style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "140%", color: "#6B7280" }}>
                {draftInvoices.length === 1
                  ? "1 invoice is waiting to be sent to the client."
                  : `${draftInvoices.length} invoices are waiting to be sent to the client.`}
              </span>
            </div>

            <div className="flex flex-row items-center flex-shrink-0" style={{ gap: 8, width: 157, height: 32 }}>
              <button
                onClick={() => {
                  // Sticky: re-showing on every dashboard visit is what makes
                  // a dismissible notice annoying. Cleared when a new draft
                  // appears (see the effect above).
                  setDraftNoticeDismissed(true);
                  localStorage.setItem("dashboardDraftNoticeDismissed", "true");
                }}
                className="box-border flex flex-row justify-center items-center flex-shrink-0 hover:bg-gray-50 transition-colors"
                style={{ padding: 12, gap: 8, width: 83, height: 32, background: "#FFFFFF", border: "1px solid rgba(31, 41, 55, 0.3)", borderRadius: 96 }}
              >
                <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "20px", color: "#1F2937" }}>
                  Dismiss
                </span>
              </button>

              <button
                onClick={() => navigate("/accounting?tab=tax&status=Draft")}
                className="flex flex-row justify-center items-center flex-shrink-0 hover:opacity-90 transition-opacity"
                style={{ padding: "12px 14px", gap: 10, width: 66, height: 32, background: "#0085FF", borderRadius: 96 }}
              >
                <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "20px", color: "#FFFFFF" }}>
                  View
                </span>
              </button>
            </div>
          </div>
        </div>
        )}

        <div
          className="-mx-4 sm:-mx-6 lg:-mx-8"
          style={{ marginTop: 24, borderBottom: "1px solid #E1E4EA" }}
        />

        <div className="flex flex-row" style={{ gap: 16, marginTop: 24, width: "100%" }}>
          <div
            className="box-border flex flex-col items-start min-w-0"
            style={{
              padding: 18,
              gap: 10,
              height: 470,
              background: "#FFFFFF",
              border: "1px solid #E1E4EA",
              borderRadius: 12,
              flex: "1 1 917px",
            }}
          >
            <span
              className="whitespace-nowrap"
              style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 16, lineHeight: "120%", color: "#1F2937" }}
            >
              Invoice Performance Analysis
            </span>

            <div className="self-stretch flex-shrink-0" style={{ width: "100%", height: 1, background: "#1F2937", opacity: 0.1 }} />

            <div className="flex flex-col items-start self-stretch flex-shrink-0" style={{ gap: 24, width: "100%", height: 101 }}>
              <div className="flex flex-row items-start self-stretch flex-shrink-0" style={{ gap: 24, width: "100%", height: 51 }}>
                {[
                  { label: "Lorem Ipsum", value: "+2.1%", color: "#1F2937" },
                  { label: "Lorem Ipsum", value: "95%", color: "#1F2937" },
                  { label: "Lorem Ipsum", value: "3.3L INR", color: "#1F2937" },
                  { label: "Lorem Ipsum", value: "12%", color: "#00C950" },
                ].map((item, idx) => (
                  <>
                    <div key={idx} className="flex flex-col items-start self-stretch flex-1" style={{ gap: 8, width: 184.25, height: 51 }}>
                      <span className="self-stretch" style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#1F2937", opacity: 0.7 }}>
                        {item.label}
                      </span>
                      <span className="self-stretch" style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 24, lineHeight: "120%", color: item.color }}>
                        {item.value}
                      </span>
                    </div>
                    {idx < 3 && <div key={`divider-${idx}`} className="self-stretch flex-shrink-0" style={{ width: 0, borderLeft: "1px solid rgba(31, 41, 55, 0.3)" }} />}
                  </>
                ))}
              </div>

              <div className="self-stretch flex-shrink-0" style={{ width: "100%", height: 1, background: "#1F2937", opacity: 0.1 }} />
            </div>

            <div
              className="flex flex-col justify-center items-center self-stretch flex-shrink-0"
              style={{ padding: "14px 0px", gap: 10, width: "100%", height: 282, background: "#F8FAFC", borderRadius: 14 }}
            >
              <div className="flex flex-col items-start self-stretch flex-shrink-0 relative" style={{ gap: 6, width: "100%", height: 230 }}>
                <div className="flex flex-col justify-between items-center self-stretch flex-shrink-0" style={{ gap: 10, width: "100%", height: 210 }}>
                  {[
                    { pct: "9%", dashed: true },
                    { pct: "8%", dashed: true },
                    { pct: "7%", dashed: true },
                    { pct: "6%", dashed: true },
                    { pct: "5%", dashed: false },
                  ].map((row) => (
                    <div key={row.pct} className="mx-auto flex flex-row items-center self-stretch flex-shrink-0" style={{ gap: 6, width: "100%", height: 14 }}>
                      <span style={{ width: 22, height: 14, fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", textAlign: "right", color: "#1F2937" }}>
                        {row.pct}
                      </span>
                      <div
                        className="flex-1"
                        style={{
                          height: 0,
                          borderTop: row.dashed ? "1px dashed rgba(31, 41, 55, 0.1)" : "1px solid rgba(31, 41, 55, 0.3)",
                        }}
                      />
                    </div>
                  ))}
                </div>

                <div className="mx-auto flex flex-row justify-between items-center self-stretch flex-shrink-0" style={{ padding: "0px 0px 0px 28px", gap: 10, width: "100%", height: 14 }}>
                  {["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8"].map((q) => (
                    <span key={q} className="mx-auto" style={{ height: 14, fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", textAlign: "right", color: "#1F2937" }}>
                      {q}
                    </span>
                  ))}
                </div>

                <div className="absolute flex flex-row justify-between items-center" style={{ gap: 22, width: "93.4%", height: 196, left: "3.4%", top: 7 }}>
                  {Array.from({ length: 8 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="self-stretch flex-shrink-0"
                      style={{ width: 0, borderLeft: idx === 0 ? "1px solid rgba(31, 41, 55, 0.3)" : "1px dashed rgba(31, 41, 55, 0.1)" }}
                    />
                  ))}
                </div>

              </div>

              <div className="flex flex-row justify-center items-center" style={{ gap: 16, width: "100%", height: 14 }}>
                <div className="flex flex-row items-center flex-shrink-0" style={{ gap: 4, width: 95, height: 14 }}>
                  <div className="flex-shrink-0" style={{ width: 16, height: 8, background: "#0AA43E", borderRadius: 4 }} />
                  <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#1F2937" }}>
                    Lorem Ipsum
                  </span>
                </div>

                <div className="flex flex-row items-center flex-shrink-0" style={{ gap: 4, width: 95, height: 14 }}>
                  <div className="flex-shrink-0" style={{ width: 16, height: 8, background: "#0085FF", borderRadius: 4 }} />
                  <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#1F2937" }}>
                    Lorem Ipsum
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            className="box-border flex flex-col items-start flex-shrink-0"
            style={{
              padding: 18,
              gap: 16,
              width: 393,
              height: 470,
              background: "#FFFFFF",
              border: "1px solid #E1E4EA",
              borderRadius: 12,
            }}
          >
            <div className="flex flex-row justify-between items-center self-stretch flex-shrink-0" style={{ gap: 16, width: "100%", height: 32 }}>
              <span
                className="whitespace-nowrap"
                style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 16, lineHeight: "120%", color: "#1F2937" }}
              >
                Invoice History
              </span>

              <button
                onClick={() => navigate("/accounting")}
                className="box-border flex flex-row justify-center items-center flex-shrink-0 hover:bg-gray-50 transition-colors"
                style={{ padding: 12, gap: 8, width: 84, height: 32, background: "#FFFFFF", border: "1px solid rgba(31, 41, 55, 0.3)", borderRadius: 96 }}
              >
                <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "20px", color: "#1F2937" }}>
                  View All
                </span>
              </button>
            </div>

            <div
              className="box-border flex flex-col items-start self-stretch min-h-0"
              style={{ padding: 8, gap: 6, width: "100%", background: "#F8FAFC", borderRadius: 6, flex: 1 }}
            >
              <div
                className="flex flex-row items-center self-stretch flex-shrink-0"
                style={{ width: "100%", height: 32, background: "#FFFFFF", borderRadius: 96 }}
              >
                <div className="flex flex-row justify-center items-center flex-1" style={{ padding: "4px 6px 4px 16px", gap: 10, height: 22 }}>
                  <span className="flex-1" style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 12, lineHeight: "120%", color: "#1F2937" }}>
                    Invoice
                  </span>
                </div>
                <div className="flex flex-row items-center flex-1" style={{ padding: "4px 6px", gap: 10, height: 22 }}>
                  <span className="flex-1" style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 12, lineHeight: "120%", textAlign: "right", color: "#1F2937" }}>
                    Amount
                  </span>
                </div>
                <div className="flex flex-row justify-center items-center flex-1" style={{ padding: "4px 6px", gap: 10, height: 22 }}>
                  <span className="flex-1" style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 12, lineHeight: "120%", color: "#1F2937" }}>
                    Status
                  </span>
                </div>
              </div>

              <div className="self-stretch flex-shrink-0" style={{ width: "100%", height: 1, background: "#1F2937", opacity: 0.1 }} />

              <div className="flex flex-col items-start self-stretch min-h-0 overflow-y-auto dc-card-scroll" style={{ gap: 2, width: "100%", flex: 1 }}>
                {invoices.map((inv, idx) => {
                  const isPaid = inv.status?.toLowerCase() === "paid" || inv.status?.toLowerCase() === "accepted";
                  return (
                  <div key={inv._id || idx} className="flex flex-col items-start self-stretch flex-shrink-0">
                    <div className="flex flex-row items-center self-stretch flex-shrink-0" style={{ width: "100%", height: 44 }}>
                      <div className="flex flex-row justify-center items-center flex-1" style={{ padding: "8px 6px 8px 16px", gap: 10, height: 30 }}>
                        <span className="flex-1" style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#1F2937" }}>
                          {inv.invoiceNumber || `INV-${idx}`}
                        </span>
                      </div>
                      <div className="flex flex-row items-center flex-1" style={{ padding: "8px 6px", gap: 10, height: 30 }}>
                        <span className="flex-1" style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 12, lineHeight: "120%", textAlign: "right", color: "#1F2937" }}>
                          {`${Math.round(inv.amount || 0).toLocaleString("en-IN")} INR`}
                        </span>
                      </div>
                      <div className="flex flex-row items-center flex-1" style={{ padding: "8px 6px", gap: 10, height: 34 }}>
                        <div
                          className="flex flex-row justify-center items-center flex-shrink-0"
                          style={{
                            padding: "6px 8px",
                            gap: 10,
                            height: 18,
                            borderRadius: 48,
                            background: isPaid ? "rgba(0, 201, 80, 0.1)" : "rgba(254, 89, 25, 0.1)",
                          }}
                        >
                          <span
                            className="whitespace-nowrap"
                            style={{
                              fontFamily: "Inter",
                              fontWeight: 600,
                              fontSize: 10,
                              lineHeight: "120%",
                              color: isPaid ? "#00C950" : "#FE5919",
                            }}
                          >
                            {inv.status}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="self-stretch flex-shrink-0" style={{ width: "100%", height: 1, background: "#1F2937", opacity: 0.1 }} />
                  </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {showBulkStrip ? (
          <div
            className={`${bulkStripClosing ? "animate-slideOutLeft" : "animate-slideInLeft"} flex flex-nowrap items-center justify-between gap-4 bg-white border border-[#E1E4EA] rounded-xl px-4 overflow-x-auto`}
            style={{ width: "100%", minHeight: 44, marginTop: 24 }}
          >
            {/* Same joined strip as every other list page: one white group
                with square inner edges, 25px on the outer ends, and colour
                carried by the icons rather than filled buttons. */}
            <div className="flex flex-nowrap items-center flex-shrink-0 py-2">
              <button
                onClick={handleExportSelectedInvoices}
                className="h-10 px-4 bg-white border border-gray-300 text-gray-900 text-sm font-medium rounded-l-[25px] hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
              >
                <DownloadIcon className="w-4 h-4 text-green-600" />
                Export
              </button>
              <button
                onClick={() => setShowBulkInvoiceStatusModal(true)}
                className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
              >
                <EditIcon className="w-4 h-4 text-blue-600" />
                Bulk Update
              </button>
              <button
                onClick={() => setShowBulkInvoiceDeleteModal(true)}
                className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
              >
                <DeleteIcon className="w-4 h-4 text-red-600" />
                Delete
              </button>
              <button
                onClick={() => setSelectedInvoices([])}
                className="h-10 px-4 -ml-px bg-white border border-gray-300 text-gray-900 text-sm font-medium rounded-r-[25px] hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <CheckSquare className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <span className="text-blue-800 font-semibold font-inter text-sm whitespace-nowrap">
                {selectedInvoices.length} invoice{selectedInvoices.length !== 1 ? "s" : ""} selected
              </span>
              <button
                onClick={handleSelectAllInvoicesAcrossPages}
                className="h-10 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-[25px] hover:bg-gray-50 focus:outline-none transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
              >
                <CheckSquare className="w-4 h-4" />
                Select All
              </button>
              <button
                onClick={handleDeselectAllInvoicesExtra}
                className="h-10 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-[25px] hover:bg-gray-50 focus:outline-none transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
              >
                <X className="w-4 h-4" />
                Deselect All
              </button>
            </div>
          </div>
        ) : (
        <div
          className="flex flex-row justify-between items-center"
          style={{ gap: 16, width: "100%", height: 44, marginTop: 24 }}
        >
          <div className="flex flex-col items-start flex-shrink-0" style={{ gap: 6, width: 614, height: 19 }}>
            <span
              className="whitespace-nowrap"
              style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 16, lineHeight: "120%", letterSpacing: "-0.5px", color: "#0E121B" }}
            >
              Top Invoices
            </span>
          </div>

          <div className="flex flex-row items-center flex-shrink-0" style={{ gap: 12, width: 528, height: 44 }}>
            <div
              className="box-border flex flex-row items-center flex-1"
              style={{ padding: "12px 14px", gap: 10, height: 44, border: "1px solid rgba(31, 41, 55, 0.1)", borderRadius: 95 }}
            >
              <SearchIcon className="w-4 h-4 text-[#525866] flex-shrink-0" />
              <input
                type="text"
                value={invoiceSearchTerm}
                onChange={(e) => setInvoiceSearchTerm(e.target.value)}
                placeholder="Search invoice by number, client, or deal..."
                className="w-full bg-transparent outline-none"
                style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 14, lineHeight: "20px", color: "#1F2937" }}
              />
            </div>

            <button
              className="box-border flex flex-row justify-center items-center flex-shrink-0"
              style={{ padding: 12, gap: 8, width: 44, height: 44, background: "#FFFFFF", border: "1px solid #E1E4EA", borderRadius: 95 }}
            >
              <FilterIcon size={16} />
            </button>

            <button
              className="box-border flex flex-row justify-center items-center flex-shrink-0"
              style={{ padding: 12, gap: 8, width: 44, height: 44, background: "#FFFFFF", border: "1px solid #E1E4EA", borderRadius: 96 }}
            >
              <MoreIcon className="w-4 h-4 text-[#1F2937]" />
            </button>
          </div>
        </div>
        )}

        <div
          className="box-border overflow-hidden"
          style={{
            padding: 0,
            width: "100%",
            background: "#FFFFFF",
            border: "1px solid #E1E4EA",
            borderRadius: 8,
            marginTop: 16,
          }}
        >
          <DataTable
            variant="card"
            maxHeight={440}
            data={paginatedInvoices}
            columns={invoiceTableColumns}
            columnSizing={invoiceColumnSizing}
            onColumnSizingChange={setInvoiceColumnSizing}
            pinnedColumns={invoicePinnedColumns}
            visibleColumns={invoiceVisibleColumns}
            onColumnReorder={handleInvoiceColumnReorder}
            getGhostPreview={getInvoiceGhostPreview}
            rowClassName={(inv) => (selectedInvoicesSet.has(inv._id) ? "!bg-blue-50" : "")}
            emptyContent={<p className="font-medium">No invoices found</p>}
          />

          {/* Pagination - Companies-style, contained within the card (not a fixed bottom navbar) */}
          {sortedInvoices.length > 0 && (
            <div
              className="w-full bg-white px-4 py-3 flex items-center justify-between flex-shrink-0"
              style={{ borderTop: "1px solid #E1E4EA" }}
            >
              <div className="flex items-center space-x-2">
                <p className="text-sm text-gray-700 font-inter">
                  Showing <span className="font-semibold">{(invoicePage - 1) * invoicesPerPage + 1}</span> to{" "}
                  <span className="font-semibold">{Math.min(invoicePage * invoicesPerPage, sortedInvoices.length)}</span> of{" "}
                  <span className="font-semibold">{sortedInvoices.length}</span> results
                </p>
                <div className="relative ml-2">
                  <select
                    value={invoicesPerPage}
                    onChange={(e) => setInvoicesPerPage(parseInt(e.target.value))}
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
                  onClick={() => setInvoicePage((p) => Math.max(1, p - 1))}
                  disabled={invoicePage === 1}
                  className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {(() => {
                  const commitPage = () => {
                    const n = parseInt(invoicePageInput, 10);
                    if (!Number.isNaN(n)) setInvoicePage(Math.min(Math.max(n, 1), invoiceTotalPages));
                    setInvoiceEditingPage(false);
                  };
                  const items = [1];
                  if (invoicePage > 2) items.push("left-dots");
                  if (invoicePage !== 1 && invoicePage !== invoiceTotalPages) items.push(invoicePage);
                  if (invoicePage < invoiceTotalPages - 1) items.push("right-dots");
                  if (invoiceTotalPages > 1) items.push(invoiceTotalPages);

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
                    const isCurrent = item === invoicePage;
                    if (isCurrent && invoiceEditingPage) {
                      return (
                        <input
                          key="page-edit"
                          autoFocus
                          type="number"
                          min={1}
                          max={invoiceTotalPages}
                          value={invoicePageInput}
                          onChange={(e) => setInvoicePageInput(e.target.value)}
                          onBlur={commitPage}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitPage();
                            if (e.key === "Escape") setInvoiceEditingPage(false);
                          }}
                          className="w-10 h-8 rounded-full border border-blue-500 text-center text-sm font-medium text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      );
                    }
                    return (
                      <button
                        key={`page-${item}`}
                        onClick={() => setInvoicePage(item)}
                        onDoubleClick={() => {
                          if (isCurrent) {
                            setInvoicePageInput(String(invoicePage));
                            setInvoiceEditingPage(true);
                          }
                        }}
                        title={isCurrent ? "Double-click to type a page number" : undefined}
                        className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                          isCurrent
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
                  onClick={() => setInvoicePage((p) => Math.min(invoiceTotalPages, p + 1))}
                  disabled={invoicePage === invoiceTotalPages}
                  className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {invoiceQuickView && (
          <InvoiceQuickView
            invoice={invoiceQuickView.invoice}
            mode={invoiceQuickView.mode}
            onClose={() => setInvoiceQuickView(null)}
            onUpdated={(updated) => {
              setInvoices((prev) => prev.map((i) => (i._id === updated._id ? { ...i, ...updated } : i)));
              setInvoiceQuickView((prev) => (prev ? { ...prev, invoice: { ...prev.invoice, ...updated } } : prev));
            }}
          />
        )}

        {showBulkInvoiceDeleteModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10005] p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
              <div className="p-6 text-center">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <DeleteIcon className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2 font-sf">
                  Confirm Delete
                </h3>
                <p className="text-sm text-gray-500 font-inter mb-6">
                  Delete {selectedInvoices.length} selected invoice{selectedInvoices.length !== 1 ? "s" : ""}? This action cannot be undone.
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => setShowBulkInvoiceDeleteModal(false)}
                    disabled={bulkInvoiceLoading}
                    className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBulkDeleteInvoices}
                    disabled={bulkInvoiceLoading}
                    className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50"
                  >
                    {bulkInvoiceLoading ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showBulkInvoiceStatusModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10005] p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
              <div className="p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-1 font-sf">
                  Bulk Update Status
                </h3>
                <p className="text-sm text-gray-500 font-inter mb-4">
                  Set status for {selectedInvoices.length} selected invoice{selectedInvoices.length !== 1 ? "s" : ""}.
                </p>
                <select
                  value={bulkInvoiceStatus}
                  onChange={(e) => setBulkInvoiceStatus(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-6"
                >
                  <option value="Pending">Pending</option>
                  <option value="Paid">Paid</option>
                  <option value="Overdue">Overdue</option>
                </select>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowBulkInvoiceStatusModal(false)}
                    disabled={bulkInvoiceLoading}
                    className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBulkUpdateInvoiceStatus}
                    disabled={bulkInvoiceLoading}
                    className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
                  >
                    {bulkInvoiceLoading ? "Updating..." : "Update"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {invoiceToDelete && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10005] p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
              <div className="p-6 text-center">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <DeleteIcon className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2 font-sf">
                  Confirm Delete
                </h3>
                <p className="text-sm text-gray-500 font-inter mb-6">
                  Delete invoice {invoiceToDelete.invoiceNumber || ""}? This action cannot be undone.
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => setInvoiceToDelete(null)}
                    className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDeleteInvoice}
                    className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ------------------- Dashboard UI -------------------
  return (
    <div style={{ marginTop: -16 }}>
      <div
        className="box-border flex flex-row justify-between items-center h-[72px] min-h-[72px] max-h-[72px] px-4 sm:px-6 lg:px-8 py-3 top-[calc(54px+var(--dc-offline-offset,0px))] lg:h-16 lg:min-h-16 lg:max-h-16 lg:py-0 lg:top-[calc(64px+var(--dc-offline-offset,0px))]"
        style={{
          position: "fixed",
          left: "var(--sidebar-width, 0px)",
          right: 0,
          zIndex: 40,
          gap: 16,
          background: "#FFFFFF",
          borderBottom: "1px solid #E1E4EA",
          boxSizing: "border-box",
        }}
      >
        <DashboardTabSwitcher />
      </div>
      {/* Spacer to offset the fixed header bar */}
      <div className="h-[72px] lg:h-16" />

      {/* KPI Cards */}
      <div
        className="grid grid-cols-2 gap-3 lg:flex lg:flex-row lg:items-stretch lg:gap-4 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8"
        style={{ marginTop: 24 }}
      >
        {[
          { icon: TotalIncomeIcon, label: "Total Income", value: `₹${Math.round(overviewKpis.totalIncome).toLocaleString("en-IN")}`, trend: `${overviewKpis.totalIncomeTrend.pct}% this month`, trendUp: overviewKpis.totalIncomeTrend.up },
          { icon: RevenueGeneratedIcon, label: "Revenue Generated", value: `₹${Math.round(overviewKpis.revenueGenerated).toLocaleString("en-IN")}`, trend: `${overviewKpis.revenueGeneratedTrend.pct}% this month`, trendUp: overviewKpis.revenueGeneratedTrend.up },
          { icon: TotalDealsClosedIcon, label: "Total Deals Closed", value: `${overviewKpis.dealsClosedCount}`, trend: `${overviewKpis.dealsClosedTrend.pct}% this month`, trendUp: overviewKpis.dealsClosedTrend.up },
          { icon: DealValueOvertimeIcon, label: "Deal Value Overtime", value: `₹${Math.round(overviewKpis.dealValue).toLocaleString("en-IN")}`, trend: `${overviewKpis.dealValueTrend.pct}% this month`, trendUp: overviewKpis.dealValueTrend.up },
        ].map((kpi, i) => (
          loading ? (
            <StatTileSkeleton key={i} subtitle />
          ) : (
            <StatTile
              key={i}
              tile={{
                ...kpi,
                subtitle: kpi.trend,
                subtitleIcon: kpi.trendUp ? TrendingUp : TrendingDown,
                subtitleColor: kpi.trendUp ? "#00C950" : "#E82222",
              }}
            />
          )
        ))}
      </div>

      {/* KPI section divider, 120px below the strip's divider (24 + 72 card height + 24) */}
      <div
        className="-mx-4 sm:-mx-6 lg:-mx-8"
        style={{ marginTop: 24, borderBottom: "1px solid #E1E4EA" }}
      />

      <div className="flex flex-col items-start" style={{ gap: 6, width: 186, height: 19, marginTop: 24 }}>
        <span
          className="whitespace-nowrap"
          style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 16, lineHeight: "120%", letterSpacing: "-0.5px", color: "#0E121B" }}
        >
          Sales Revenue
        </span>
      </div>

      <div
        className="box-border flex flex-row items-stretch self-stretch"
        style={{ padding: 12, gap: 16, height: 450, maxHeight: 450, border: "1px solid #E1E4EA", borderRadius: 12, marginTop: 16, flexShrink: 0 }}
      >
        {loading ? (
          <div className="flex flex-row flex-1 min-w-0" style={{ gap: 0 }}>
            <div
              className="flex flex-col justify-between items-start flex-shrink-0"
              style={{ width: 64, height: "100%", padding: "8px 0" }}
            >
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} width={44} height={11} />
              ))}
            </div>
            <div className="flex-1 min-w-0 animate-pulse" style={{ height: "100%" }}>
              <svg
                width="100%"
                height="100%"
                viewBox="0 0 400 160"
                preserveAspectRatio="none"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M0 130 C 20 125, 35 118, 50 122 C 65 126, 75 132, 90 128 C 105 124, 115 100, 130 90 C 145 80, 155 96, 170 92 C 185 88, 195 60, 210 50 C 225 40, 235 58, 250 55 C 265 52, 280 68, 295 72 C 310 76, 320 62, 335 66 C 350 70, 365 82, 380 86 L 400 88 L 400 160 L 0 160 Z"
                  fill="#E5E7EB"
                />
                <path
                  d="M0 130 C 20 125, 35 118, 50 122 C 65 126, 75 132, 90 128 C 105 124, 115 100, 130 90 C 145 80, 155 96, 170 92 C 185 88, 195 60, 210 50 C 225 40, 235 58, 250 55 C 265 52, 280 68, 295 72 C 310 76, 320 62, 335 66 C 350 70, 365 82, 380 86 L 400 88"
                  stroke="#D1D5DB"
                  strokeWidth="2"
                  fill="none"
                />
              </svg>
            </div>
          </div>
        ) : (
          <div className="flex flex-row flex-1 min-w-0" style={{ gap: 0 }}>
            {/* Fixed Y-axis, mirrors the Financial Overview chart's fixed axis column */}
            <div style={{ width: 64, height: "100%", flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlySalesRevenueData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tick={false}
                    padding={{ left: 0, right: 0 }}
                  />
                  <YAxis
                    domain={[0, salesRevenueYMax]}
                    tickFormatter={formatSalesRevenueTick}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={64}
                    tick={{ fontSize: 12, fontFamily: "Inter", fill: "rgba(33, 32, 31, 0.56)" }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="none" fill="none" isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div
              ref={salesRevenueScrollRef}
              className="sales-revenue-chart-scroll flex-1 min-w-0 overflow-x-auto overflow-y-hidden"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none", cursor: "grab", height: "100%" }}
            >
              <div
                style={{
                  minWidth: `${Math.max(100, (salesRevenueMonthTicks.length / (isMobileViewport ? 5 : 12)) * 100)}%`,
                  height: "100%",
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthlySalesRevenueData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0C4FCD" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#0C4FCD" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E7E4E3" vertical={false} />
                    <XAxis
                      dataKey="month"
                      ticks={salesRevenueMonthTicks}
                      tickFormatter={formatSalesRevenueMonthTick}
                      tickLine={false}
                      axisLine={false}
                      padding={{ left: 12, right: 12 }}
                      tick={{ fontSize: 12, fontFamily: "Inter", fill: "rgba(33, 32, 31, 0.56)" }}
                    />
                    <YAxis domain={[0, salesRevenueYMax]} hide />
                    {/* Sales Revenue had no Tooltip at all - hovering the
                        chart showed nothing. Labels use each point's own
                        "DD Mon" (the x tick only labels month starts, so the
                        raw label is the only thing that identifies a point). */}
                    <Tooltip
                      cursor={{ stroke: "#0C4FCD", strokeWidth: 1, strokeDasharray: "3 3" }}
                      labelFormatter={(label) => label}
                      formatter={(value, name) => [
                        `₹${formatNumberToIndian(Math.round(value || 0))}`,
                        name === "revenue" ? "Revenue" : "Trend",
                      ]}
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #E1E4EA",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                        fontFamily: "Inter",
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="linear"
                      dataKey="revenue"
                      stroke="#0C4FCD"
                      strokeWidth={2}
                      fill="url(#salesRevenueGradient)"
                      isAnimationActive={false}
                      dot={(dotProps) => {
                        const { cx, cy, index, key } = dotProps;
                        if (index !== monthlySalesRevenueData.length - 1) return <Fragment key={key} />;
                        return <circle key={key} cx={cx} cy={cy} r={6} fill="#FFFFFF" stroke="#0C4FCD" strokeWidth={1} />;
                      }}
                    />
                    <Line
                      type="natural"
                      dataKey="trendRevenue"
                      stroke="#34C759"
                      strokeWidth={2}
                      strokeDasharray="4 3"
                      dot={false}
                      activeDot={false}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col lg:flex-row" style={{ gap: 16, marginTop: 16, width: "100%" }}>
        <div
          className="box-border flex flex-col items-start flex-none w-full lg:flex-1 lg:basis-0 lg:w-auto"
          style={{
            padding: 18,
            gap: 16,
            minWidth: 0,
            height: 390,
            background: "#FFFFFF",
            border: "1px solid #E1E4EA",
            boxShadow: "0px 38px 23px rgba(0, 0, 0, 0.01), 0px 17px 17px rgba(0, 0, 0, 0.02), 0px 4px 9px rgba(0, 0, 0, 0.02)",
            borderRadius: 12,
          }}
        >
          <div className="flex flex-row items-start self-stretch flex-shrink-0" style={{ gap: 16, width: "100%", height: 88 }}>
            <div className="flex flex-col items-start flex-1 min-w-0" style={{ gap: 8, height: 76 }}>
              {loading ? (
                <Skeleton width={110} height={12} />
              ) : (
              <span
                className="self-stretch truncate text-[11px] sm:text-sm"
                style={{ fontFamily: "'Inter Tight', Inter, sans-serif", fontWeight: 500, lineHeight: "120%", color: "#1F2937", opacity: 0.7 }}
              >
                Total Invoices Issued
              </span>
              )}
              {loading ? (
                <Skeleton width={140} height={24} />
              ) : (
                <span
                  className="self-stretch truncate text-base sm:text-2xl"
                  style={{ fontFamily: "'Inter Tight', Inter, sans-serif", fontWeight: 600, lineHeight: "120%", color: "#000000" }}
                >
                  ₹{Math.round(invoiceStats.total).toLocaleString("en-IN")}
                </span>
              )}
              {loading ? (
                <Skeleton width={80} height={12} />
              ) : (
                <span
                  className="self-stretch truncate text-[10px] sm:text-xs"
                  style={{ fontFamily: "Inter", fontWeight: 500, lineHeight: "120%", color: "#6B7280" }}
                >
                  {totalInvoicesCard.clearedPct}% Cleared
                </span>
              )}
            </div>

            <div className="flex-shrink-0 self-stretch" style={{ width: 1, background: "#1F2937", opacity: 0.1 }} />

            <div className="flex flex-col items-start flex-1 min-w-0" style={{ gap: 8, height: 88 }}>
              {loading ? (
                <Skeleton width={80} height={12} />
              ) : (
                <span
                  className="self-stretch truncate text-[10px] sm:text-xs"
                  style={{ fontFamily: "Inter", fontWeight: 500, lineHeight: "120%", color: "#1F2937", opacity: 0.7 }}
                >
                  {totalInvoicesCard.topClient?.companyName || "No invoices yet"}
                </span>
              )}

              {loading ? (
                <Skeleton width="100%" height={66} shape="rect" className="rounded-md" />
              ) : (
                <div
                  className="box-border flex flex-col items-start self-stretch flex-shrink-0"
                  style={{ padding: 6, gap: 6, height: 66, background: "#F8FAFC", borderRadius: 6 }}
                >
                  <div className="flex flex-row justify-between items-center self-stretch flex-shrink-0 min-w-0" style={{ gap: 8, height: 12 }}>
                    <span className="truncate min-w-0" style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 10, lineHeight: "120%", color: "#6B7280" }}>
                      {totalInvoicesCard.topClient?.dealTitle || "—"}
                    </span>
                    <span className="flex-shrink-0" style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 10, lineHeight: "120%", color: "#1F2937" }}>
                      {totalInvoicesCard.topClientPct}%
                    </span>
                  </div>

                  <div className="flex flex-row items-start self-stretch flex-shrink-0" style={{ gap: 2, height: 18 }}>
                    {Array.from({ length: 39 }).map((_, idx) => (
                      <div
                        key={idx}
                        className="flex-1"
                        style={{
                          width: 2.32,
                          height: 18,
                          background: idx < Math.round((totalInvoicesCard.topClientPct / 100) * 39) ? "#0085FF" : "#E2E5E8",
                        }}
                      />
                    ))}
                  </div>

                  <div className="flex flex-row justify-between items-center self-stretch flex-shrink-0" style={{ gap: 8, height: 12 }}>
                    <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 10, lineHeight: "120%", color: "#6B7280" }}>
                      Invoices Paid
                    </span>
                    <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 10, lineHeight: "120%", color: "#1F2937" }}>
                      {totalInvoicesCard.topClient?.paidCount || 0} of {totalInvoicesCard.topClient?.count || 0}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="self-stretch flex-shrink-0" style={{ width: "100%", height: 1, background: "#1F2937", opacity: 0.1 }} />

          <div
            className="box-border flex flex-col items-start self-stretch flex-shrink-0"
            style={{ padding: 8, gap: 6, isolation: "isolate", width: "100%", height: 233, background: "#F8FAFC", borderRadius: 6 }}
          >
            {loading ? (
              <Skeleton width={130} height={12} />
            ) : (
            <span
              className="self-stretch"
              style={{ fontFamily: "'Inter Tight', Inter, sans-serif", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#1F2937" }}
            >
              Payment Progress
            </span>
            )}

            {loading ? (
              <Skeleton width="100%" height={197} shape="rect" className="rounded-md" />
            ) : (
              <div className="relative flex flex-row items-center self-stretch flex-shrink-0" style={{ height: 197 }}>
                {totalInvoicesCard.points.map((p, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col justify-center items-center self-stretch flex-1"
                    style={{ gap: 6 }}
                  >
                    <div className="flex-1" style={{ width: 1, background: "rgba(31, 41, 55, 0.1)" }} />
                    <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 12, lineHeight: "120%", color: "#6B7280" }}>
                      {totalInvoicesCard.months[idx]}
                    </span>
                  </div>
                ))}

                <div className="absolute" style={{ left: 0, right: 0, height: 124, top: 29 }}>
                  <svg width="100%" height="124" viewBox="0 0 374 124" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d={totalInvoicesCard.linePath} stroke="#0085FF" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" />
                    {totalInvoicesCard.points.map((p, idx) => (
                      <circle key={idx} cx={p.x} cy={p.y} r={2.5} fill="#FFFFFF" stroke="#0085FF" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    ))}
                  </svg>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col self-stretch flex-none w-full lg:flex-1 lg:basis-0 lg:w-auto" style={{ gap: 12, minWidth: 0 }}>
          <div
            className="box-border flex flex-col items-start self-stretch flex-shrink-0"
            style={{
              padding: 18,
              gap: 8,
              width: "100%",
              height: 150,
              background: "#FFFFFF",
              border: "1px solid #E0E3E9",
              boxShadow: "0px 38px 23px rgba(0, 0, 0, 0.01), 0px 17px 17px rgba(0, 0, 0, 0.02), 0px 4px 9px rgba(0, 0, 0, 0.02)",
              borderRadius: 12,
            }}
          >
            <div className="flex flex-row items-start self-stretch flex-shrink-0" style={{ gap: 16, width: "100%", height: 76 }}>
              <div className="flex flex-col items-start flex-1 min-w-0" style={{ gap: 8, height: 76 }}>
                {loading ? <Skeleton width={80} height={12} /> : (
                <span
                  className="self-stretch truncate text-[11px] sm:text-sm"
                  style={{ fontFamily: "Inter", fontWeight: 500, lineHeight: "120%", color: "#1F2937", opacity: 0.7 }}
                >
                  {selectedQuarter} Earnings
                </span>
                )}
                {loading ? <Skeleton width={130} height={24} /> : (
                <span
                  className="self-stretch truncate text-base sm:text-2xl"
                  style={{ fontFamily: "Inter", fontWeight: 600, lineHeight: "120%", color: "#1F2937" }}
                >
                  {Math.round(quarterlyEarnings.total).toLocaleString("en-IN")} INR
                </span>
                )}
                {loading ? <Skeleton width={110} height={12} /> : (
                <span
                  className="self-stretch truncate text-[10px] sm:text-xs"
                  style={{ fontFamily: "Inter", fontWeight: 500, lineHeight: "120%", color: "#6B7280" }}
                >
                  {quarterlyEarnings.pctChange >= 0 ? "+" : ""}{quarterlyEarnings.pctChange}% from last quarter
                </span>
                )}
              </div>

              <div className="flex-shrink-0 self-stretch" style={{ width: 1, background: "#1F2937", opacity: 0.1 }} />

              <div className="flex flex-col justify-center items-start flex-1" style={{ gap: 8, height: 68 }}>
                {loading ? (
                  <>
                    <Skeleton width="100%" height={30} shape="rect" className="rounded-md" />
                    <Skeleton width="100%" height={30} shape="rect" className="rounded-md" />
                  </>
                ) : (
                  [
                    { label: "Revenue", value: `₹${Math.round(quarterlyEarnings.revenue).toLocaleString("en-IN")}` },
                    { label: "Profit", value: `₹${Math.round(quarterlyEarnings.profit).toLocaleString("en-IN")}` },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="box-border flex flex-col items-start self-stretch flex-shrink-0 min-w-0 w-full sm:w-[178.5px]"
                      style={{ padding: 8, gap: 6, height: 30, background: "#F8FAFC", borderRadius: 6 }}
                    >
                      <div className="flex flex-row justify-between items-center self-stretch flex-shrink-0 min-w-0" style={{ gap: 8, height: 14 }}>
                        <span className="truncate text-[10px] sm:text-xs" style={{ fontFamily: "Inter", fontWeight: 400, lineHeight: "120%", color: "#6B7280" }}>
                          {item.label}
                        </span>
                        <span className="truncate text-[10px] sm:text-xs" style={{ fontFamily: "Inter", fontWeight: 500, lineHeight: "120%", color: "#1F2937" }}>
                          {item.value}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {loading ? (
              <Skeleton width="100%" height={30} shape="rect" className="rounded-md" />
            ) : (
              <div
                className="box-border flex flex-col items-start self-stretch flex-shrink-0 h-auto min-h-[30px] sm:h-[30px]"
                style={{
                  padding: 8, gap: 6, width: "100%", borderRadius: 6,
                  background: quarterlyEarnings.pctChange >= 0 ? "rgba(0, 133, 255, 0.1)" : "rgba(232, 34, 34, 0.1)",
                }}
              >
                <span className="text-[10px] sm:text-xs" style={{ fontFamily: "Inter", fontWeight: 500, lineHeight: "120%", color: quarterlyEarnings.pctChange >= 0 ? "#0085FF" : "#E82222" }}>
                  {quarterlyEarnings.pctChange >= 0 ? "Outperforming" : "Underperforming"} last quarter by {Math.abs(quarterlyEarnings.pctChange)}%
                </span>
              </div>
            )}
          </div>

          <div
            className="box-border flex flex-col justify-center items-center self-stretch flex-shrink-0"
            style={{
              padding: 18,
              gap: 8,
              width: "100%",
              height: 228,
              background: "#FFFFFF",
              border: "1px solid #E0E3E9",
              boxShadow: "0px 38px 23px rgba(0, 0, 0, 0.01), 0px 17px 17px rgba(0, 0, 0, 0.02), 0px 4px 9px rgba(0, 0, 0, 0.02)",
              borderRadius: 12,
            }}
          >
            <div className="flex flex-row justify-between items-center self-stretch flex-shrink-0" style={{ gap: 8, width: "100%", height: 28 }}>
              {loading ? <Skeleton width={140} height={14} /> : (
              <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
                Earnings Performance
              </span>
              )}

              {loading ? (
                <Skeleton width={64} height={28} shape="rect" style={{ borderRadius: 4 }} />
              ) : (
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setShowQuarterMenu((v) => !v)}
                  className="box-border flex flex-row justify-center items-center flex-shrink-0"
                  style={{ padding: "4px 6px 4px 12px", gap: 6, width: 64, height: 28, border: "1px solid rgba(31, 41, 55, 0.3)", borderRadius: 4, background: "#FFFFFF", cursor: "pointer" }}
                >
                  <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 16, lineHeight: "20px", color: "#1F2937" }}>
                    {selectedQuarter}
                  </span>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5.5 7.5L10 12L14.5 7.5" stroke="#1F2937" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {showQuarterMenu && (
                  <>
                    <div className="fixed inset-0 z-[9998]" onClick={() => setShowQuarterMenu(false)} />
                    <div
                      className="absolute right-0 top-full mt-1 z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1 flex flex-col gap-0.5"
                      style={{ width: 64 }}
                    >
                      {["Q1", "Q2", "Q3", "Q4"].map((q) => (
                        <button
                          key={q}
                          onClick={() => {
                            setSelectedQuarter(q);
                            setShowQuarterMenu(false);
                          }}
                          className={`w-full text-left px-2 py-1.5 rounded-md text-sm font-medium ${q === selectedQuarter ? "bg-blue-50 text-blue-700" : "text-[#1F2937] hover:bg-gray-50"}`}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              )}
            </div>

            <div className="flex flex-row items-start self-stretch flex-shrink-0" style={{ gap: 8, width: "100%", height: 134 }}>
              <div className="flex flex-col justify-center items-center self-stretch flex-shrink-0" style={{ gap: 8, width: 248, height: 134 }}>
                {loading ? <Skeleton width={70} height={14} /> : (
                <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
                  Revenue
                </span>
                )}
                {loading ? (
                  <Skeleton width="100%" height={60} shape="rect" style={{ borderRadius: 4 }} />
                ) : (
                <div className="self-stretch flex-shrink-0" style={{ width: `${Math.max(8, quarterlyEarnings.revenueScore * 10)}%`, height: 24, background: "#0085FF", borderRadius: 4 }} />
                )}
                {loading ? <Skeleton width={24} height={14} /> : (
                <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
                  {quarterlyEarnings.revenueScore}
                </span>
                )}
              </div>

              <div className="flex flex-col justify-center items-center self-stretch flex-shrink-0 flex-1" style={{ gap: 8, height: 134 }}>
                {loading ? <Skeleton width={50} height={14} /> : (
                <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
                  Profit
                </span>
                )}
                {loading ? (
                  <Skeleton width="100%" height={90} shape="rect" style={{ borderRadius: 4 }} />
                ) : (
                <div className="self-stretch flex-shrink-0" style={{ width: `${Math.max(8, quarterlyEarnings.profitScore * 10)}%`, height: 24, background: "#0AA43E", borderRadius: 4 }} />
                )}
                {loading ? <Skeleton width={24} height={14} /> : (
                <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
                  {quarterlyEarnings.profitScore}
                </span>
                )}
              </div>
            </div>

            {loading ? (
              <div className="flex flex-row justify-center items-center self-stretch flex-shrink-0" style={{ gap: 16, width: "100%", height: 14 }}>
                <Skeleton width={70} height={14} />
                <Skeleton width={52} height={14} />
              </div>
            ) : (
            <div className="flex flex-row justify-center items-center self-stretch flex-shrink-0" style={{ gap: 16, width: "100%", height: 14 }}>
              <div className="flex flex-row items-center flex-shrink-0" style={{ gap: 4, width: 70, height: 14 }}>
                <div className="flex-shrink-0" style={{ width: 16, height: 8, background: "#0085FF", borderRadius: 4 }} />
                <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#1F2937" }}>
                  Revenue
                </span>
              </div>

              <div className="flex flex-row items-center flex-shrink-0" style={{ gap: 4, width: 52, height: 14 }}>
                <div className="flex-shrink-0" style={{ width: 16, height: 8, background: "#0AA43E", borderRadius: 4 }} />
                <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#1F2937" }}>
                  Profit
                </span>
              </div>
            </div>
            )}
          </div>
        </div>

        <div
          className="box-border flex flex-col items-start flex-none w-full lg:flex-1 lg:basis-0 lg:w-auto"
          style={{
            padding: 18,
            gap: 16,
            minWidth: 0,
            height: 390,
            background: "#FFFFFF",
            border: "1px solid #E1E4EA",
            boxShadow: "0px 38px 23px rgba(0, 0, 0, 0.01), 0px 17px 17px rgba(0, 0, 0, 0.02), 0px 4px 9px rgba(0, 0, 0, 0.02)",
            borderRadius: 12,
          }}
        >
          <div className="flex flex-col items-start self-stretch flex-shrink-0 min-w-0" style={{ gap: 8, width: "100%", height: 81 }}>
            <div className="flex flex-row justify-between items-center self-stretch flex-shrink-0 min-w-0" style={{ gap: 8, height: 22 }}>
              <span
                className="truncate min-w-0 text-[11px] sm:text-sm"
                style={{ fontFamily: "Inter", fontWeight: 500, lineHeight: "120%", color: "#1F2937", opacity: 0.7 }}
              >
                Recent Deals
              </span>

              <div
                className="flex flex-row justify-center items-center flex-shrink-0"
                style={{ padding: "4px 6px", gap: 10, width: 63, height: 22, background: "rgba(0, 133, 255, 0.1)", borderRadius: 41, marginRight: 12 }}
              >
                <span className="text-[10px] sm:text-xs" style={{ fontFamily: "Inter", fontWeight: 500, lineHeight: "120%", color: "#0085FF" }}>
                  Top Deal
                </span>
              </div>
            </div>

            {loading ? <Skeleton width={150} height={24} /> : (
            <span
              className="self-stretch truncate text-base sm:text-2xl"
              style={{ fontFamily: "'Inter Tight', Inter, sans-serif", fontWeight: 600, lineHeight: "120%", color: "#000000" }}
            >
              {recentDealsWidget.topDeal
                ? (recentDealsWidget.topDeal.company?.name || recentDealsWidget.topDeal.title || "—")
                : "No deals yet"}
            </span>
            )}

            {loading ? <Skeleton width={130} height={12} /> : (
            <span
              className="self-stretch truncate text-[10px] sm:text-xs"
              style={{ fontFamily: "Inter", fontWeight: 500, lineHeight: "120%", color: "#6B7280" }}
            >
              {recentDealsWidget.topDeal
                ? `INR ${Math.round(recentDealsWidget.topDeal.amount || 0).toLocaleString("en-IN")} deal value`
                : "—"}
            </span>
            )}
          </div>

          <div className="self-stretch flex-shrink-0" style={{ width: "100%", height: 1, background: "#1F2937", opacity: 0.1 }} />

          <div
            className="box-border flex flex-col items-start self-stretch"
            style={{ padding: 8, gap: 6, width: "100%", flex: "1 1 auto", minHeight: 0, background: "#F8FAFC", borderRadius: 6 }}
          >
            <div
              className="flex flex-row items-start self-stretch flex-shrink-0"
              style={{ width: "100%", height: 22, background: "#FFFFFF", borderRadius: 6 }}
            >
              {["Client", "Deal", "Amount"].map((label, idx) => (
                <div
                  key={label}
                  className="flex flex-row items-center flex-1"
                  style={{ justifyContent: idx === 2 ? "flex-end" : "flex-start", padding: "4px 6px", gap: 10, height: 22 }}
                >
                  <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 12, lineHeight: "120%", color: "#1F2937", textAlign: idx === 2 ? "right" : "left" }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-col items-start self-stretch justify-between" style={{ gap: 2, width: "100%", flex: "1 1 auto", minHeight: 0 }}>
              <div className="self-stretch flex-shrink-0" style={{ width: "100%", height: 1, background: "#1F2937", opacity: 0.1 }} />

              {loading
                ? Array.from({ length: 6 }).map((_, idx) => (
                  <div key={idx} className="flex flex-col items-start self-stretch flex-shrink-0">
                    <div className="flex flex-row items-center self-stretch flex-shrink-0" style={{ width: "100%", height: 30, gap: 10 }}>
                      <div className="flex-1" style={{ padding: "0 6px" }}><Skeleton width="70%" height={11} /></div>
                      <div className="flex-1" style={{ padding: "0 6px" }}><Skeleton width="60%" height={11} /></div>
                      <div className="flex-1 flex justify-end" style={{ padding: "0 6px" }}><Skeleton width="50%" height={11} /></div>
                    </div>
                    <div className="self-stretch flex-shrink-0" style={{ width: "100%", height: 1, background: "#1F2937", opacity: 0.1 }} />
                  </div>
                ))
                : recentDealsWidget.recent.length === 0 ? (
                  <div className="flex items-center justify-center self-stretch" style={{ padding: "20px 0" }}>
                    <span style={{ fontFamily: "Inter", fontSize: 12, color: "#6B7280" }}>No deals yet</span>
                  </div>
                ) : recentDealsWidget.recent.map((row, idx) => (
                <div key={idx} className="flex flex-col items-start self-stretch flex-shrink-0">
                  <div className="flex flex-row items-center self-stretch flex-shrink-0" style={{ width: "100%", height: 30 }}>
                    <div className="flex flex-row justify-start items-center flex-1" style={{ padding: "8px 6px", gap: 10, height: 30, minWidth: 0 }}>
                      <span className="self-stretch truncate" style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#1F2937" }}>
                        {row.client}
                      </span>
                    </div>
                    <div className="flex flex-row justify-start items-center flex-1" style={{ padding: "8px 6px", gap: 10, height: 30, minWidth: 0 }}>
                      <span className="self-stretch truncate" style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#1F2937" }}>
                        {row.deal}
                      </span>
                    </div>
                    <div className="flex flex-row justify-end items-center flex-1" style={{ padding: "8px 6px", gap: 10, height: 30, minWidth: 0 }}>
                      <span className="truncate" style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 12, lineHeight: "120%", color: "#1F2937", textAlign: "right" }}>
                        {row.amount}
                      </span>
                    </div>
                  </div>
                  <div className="self-stretch flex-shrink-0" style={{ width: "100%", height: 1, background: "#1F2937", opacity: 0.1 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <UpgradeRequiredModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        minPlan="growth"
        feature="Selecting multiple rows"
      />
    </div>
  );
}

export default Dashboard;
