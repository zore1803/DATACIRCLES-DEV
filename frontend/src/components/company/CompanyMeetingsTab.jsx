import DeleteIcon from "../common/DeleteIcon";
import EmptyState from "../common/EmptyState";
import VideoIcon from "../common/VideoIcon";
import Checkbox from "../common/Checkbox";
import PlusIcon from "../common/PlusIcon";
import React, { useEffect, useMemo, useState, useRef } from "react";
import { DATE_RANGES, getDateRangeLabel } from "../../utils/dateBuckets";
import { createPortal } from "react-dom";
import { getAncestorZoom } from "../../utils/domUtils";
import { getPinnedBoundaryOverlayStyle } from "../../utils/pinnedColumnShadow";
import {
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Pin,
  PinOff,
  AlarmClock,
  EyeOff,
  X, ArrowUp, ArrowDown
} from "lucide-react";
import { EditablePaginationButtons } from "../common/EditablePaginationButtons";
import toast from "react-hot-toast";
import API from "../../services/api";
import AdminMeetingForm from "../admin/AdminMeetingForm";
import MeetingDetailsModal from "./MeetingDetailsModal";
import FilterIcon from "../common/FilterIcon";
import HighlightText from "../common/HighlightText";
import ToolbarFilterGroup from "./ToolbarFilterGroup";
import { applyColumnFilters } from "../../utils/advancedFilters";
import TableSkeletonRows from "../common/TableSkeletonRows";
import Skeleton from "../common/Skeleton";
import StatTile from "../common/StatTile";
import StatTileSkeleton from "../common/StatTileSkeleton";
import BulkActionBar from "../common/BulkActionBar";
import { useBulkSelection, useBulkStrip } from "../../hooks/useBulkSelection";
import { exportToCSV } from "../../utils/exportToCSV";
import { bulkDelete } from "../../utils/bulkOperations";
import useFillToBottom from "../../hooks/useFillToBottom";

import SearchIcon from "../common/SearchIcon";
import TeamIcon from "../common/TeamIcon";
import EyeIcon from "../common/EyeIcon";
import EditIcon from "../common/EditIcon";
const MEETING_TYPE_LABELS = { "in-person": "In-person", "video-call": "Video Call", "phone-call": "Phone Call" };
const MEETING_STATUS_LABELS = { scheduled: "Scheduled", completed: "Completed", cancelled: "Cancelled", "no-show": "No-show" };
const MEETING_FILTER_COLUMNS = [
  { key: "type", label: "Type", options: Object.values(MEETING_TYPE_LABELS) },
  { key: "status", label: "Status", options: Object.values(MEETING_STATUS_LABELS) },
  { key: "dateTime", label: "Date & Time", placeholder: "All Dates", options: DATE_RANGES.map((r) => r.label) },
];

const DayViewIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="12 14 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M16.1667 28.1667C15.7083 28.1667 15.316 28.0035 14.9896 27.6771C14.6632 27.3507 14.5 26.9583 14.5 26.5V21.5C14.5 21.0417 14.6632 20.6493 14.9896 20.3229C15.316 19.9965 15.7083 19.8333 16.1667 19.8333H27.8333C28.2917 19.8333 28.684 19.9965 29.0104 20.3229C29.3368 20.6493 29.5 21.0417 29.5 21.5V26.5C29.5 26.9583 29.3368 27.3507 29.0104 27.6771C28.684 28.0035 28.2917 28.1667 27.8333 28.1667H16.1667ZM16.1667 26.5H27.8333V21.5H16.1667V26.5ZM14.5 18.1667V16.5H29.5V18.1667H14.5ZM14.5 31.5V29.8333H29.5V31.5H14.5Z" fill="currentColor" />
  </svg>
);

const TotalMeetingsIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="24 24 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M35.7893 43.9712C35.8879 43.9712 35.9883 43.9481 36.0903 43.902C36.1921 43.8558 36.2725 43.8032 36.3315 43.7442L44.3295 35.7462C44.5552 35.5206 44.7251 35.2795 44.8393 35.023C44.9533 34.7666 45.0103 34.4975 45.0103 34.2155C45.0103 33.9231 44.9533 33.6417 44.8393 33.3712C44.7251 33.1006 44.5552 32.8576 44.3295 32.6422L40.3295 28.6422C40.1142 28.4166 39.8809 28.2515 39.6295 28.147C39.3784 28.0426 39.1066 27.9905 38.8143 27.9905C38.5323 27.9905 38.2614 28.0426 38.0018 28.147C37.7421 28.2515 37.5027 28.4166 37.2835 28.6422L36.7103 29.2155L38.5603 31.0807C38.7846 31.2949 38.9504 31.5391 39.0575 31.8135C39.1645 32.0878 39.218 32.3724 39.218 32.6672C39.218 33.2776 39.0142 33.7866 38.6065 34.1942C38.1989 34.6019 37.6899 34.8057 37.0795 34.8057C36.7847 34.8057 36.4991 34.757 36.2228 34.6595C35.9466 34.5621 35.7014 34.4064 35.4873 34.1922L33.593 32.3135L29.247 36.6595C29.1714 36.7351 29.1146 36.8198 29.0768 36.9135C29.0389 37.007 29.02 37.1031 29.02 37.202C29.02 37.3865 29.0829 37.5441 29.2085 37.675C29.3342 37.8058 29.4893 37.8712 29.6738 37.8712C29.7726 37.8712 29.8729 37.8481 29.9748 37.802C30.0768 37.7558 30.1573 37.7032 30.2163 37.6442L33.5008 34.3597L34.5545 35.4135L31.2853 38.698C31.2098 38.7736 31.1531 38.8583 31.1153 38.952C31.0774 39.0455 31.0585 39.1416 31.0585 39.2405C31.0585 39.4186 31.1229 39.5721 31.2518 39.701C31.3806 39.8298 31.5341 39.8942 31.7123 39.8942C31.8111 39.8942 31.9114 39.8711 32.0133 39.825C32.1153 39.7788 32.1957 39.7262 32.2545 39.6672L35.6545 36.2827L36.7085 37.3365L33.3238 40.7365C33.2546 40.7955 33.1995 40.8759 33.1585 40.9777C33.1175 41.0797 33.097 41.1801 33.097 41.2787C33.097 41.4571 33.1614 41.6106 33.2903 41.7395C33.4191 41.8683 33.5726 41.9327 33.7508 41.9327C33.8494 41.9327 33.9456 41.9138 34.0393 41.876C34.1328 41.8381 34.2174 41.7814 34.293 41.7057L37.693 38.3212L38.747 39.375L35.347 42.775C35.2714 42.8506 35.2146 42.9385 35.1768 43.0385C35.1389 43.1385 35.12 43.2346 35.12 43.327C35.12 43.5115 35.1886 43.665 35.3258 43.7875C35.4629 43.91 35.6174 43.9712 35.7893 43.9712ZM35.7738 45.471C35.2084 45.471 34.7155 45.2749 34.295 44.8827C33.8745 44.4904 33.6547 44.0019 33.6355 43.4172C33.0689 43.3787 32.5954 43.1775 32.2153 42.8135C31.8351 42.4493 31.629 41.9711 31.597 41.3787C31.0047 41.3404 30.5259 41.1334 30.1605 40.7577C29.795 40.3821 29.5994 39.9096 29.5738 39.3402C28.9789 39.3019 28.4879 39.0862 28.1008 38.6932C27.7136 38.3002 27.52 37.8031 27.52 37.202C27.52 36.9071 27.5761 36.6183 27.6883 36.3355C27.8004 36.0528 27.9636 35.8045 28.1778 35.5905L33.593 30.1905L36.522 33.1192C36.5809 33.1884 36.658 33.2436 36.7535 33.2847C36.8492 33.3257 36.9528 33.3462 37.0643 33.3462C37.2463 33.3462 37.4033 33.286 37.5353 33.1655C37.6674 33.045 37.7335 32.8872 37.7335 32.6922C37.7335 32.5807 37.713 32.4772 37.672 32.3817C37.6309 32.2862 37.5757 32.209 37.5065 32.15L33.9988 28.6422C33.7834 28.4166 33.5485 28.2515 33.294 28.147C33.0395 28.0426 32.7661 27.9905 32.4738 27.9905C32.1918 27.9905 31.9242 28.0426 31.671 28.147C31.4177 28.2515 31.1783 28.4166 30.9528 28.6422L27.668 31.9422C27.486 32.1242 27.337 32.3393 27.221 32.5875C27.105 32.8355 27.0368 33.0884 27.0163 33.3462C26.9956 33.5591 27.0052 33.7696 27.045 33.978C27.0847 34.1863 27.1545 34.3821 27.2545 34.5655L26.1508 35.6692C25.9251 35.3436 25.7553 34.9788 25.6413 34.575C25.5271 34.1711 25.4803 33.7616 25.5008 33.3462C25.5213 32.8859 25.6251 32.4413 25.8123 32.0125C25.9994 31.5836 26.2616 31.2006 26.5988 30.8635L29.8738 27.5885C30.2483 27.2243 30.6557 26.9503 31.096 26.7665C31.5364 26.5825 31.9989 26.4905 32.4835 26.4905C32.968 26.4905 33.4289 26.5825 33.866 26.7665C34.3034 26.9503 34.704 27.2243 35.068 27.5885L35.6413 28.1615L36.2143 27.5885C36.5886 27.2243 36.9944 26.9503 37.4315 26.7665C37.8687 26.5825 38.3296 26.4905 38.8143 26.4905C39.2989 26.4905 39.7614 26.5825 40.2018 26.7665C40.6421 26.9503 41.0444 27.2243 41.4085 27.5885L45.3835 31.5635C45.7475 31.9276 46.0264 32.3421 46.22 32.8067C46.4135 33.2714 46.5103 33.7461 46.5103 34.2307C46.5103 34.7154 46.4135 35.1763 46.22 35.6135C46.0264 36.0506 45.7475 36.4512 45.3835 36.8152L37.3853 44.798C37.1648 45.0185 36.9164 45.1858 36.6403 45.3C36.3639 45.414 36.0751 45.471 35.7738 45.471Z" fill="currentColor" />
  </svg>
);

const UpcomingMeetingsIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="361.5 24 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M374.557 41.328C374.109 40.8798 373.885 40.3346 373.885 39.6923C373.885 39.0499 374.109 38.5048 374.557 38.0568C375.005 37.6088 375.55 37.3848 376.192 37.3848C376.835 37.3848 377.38 37.6088 377.828 38.0568C378.276 38.5048 378.5 39.0499 378.5 39.6923C378.5 40.3346 378.276 40.8798 377.828 41.328C377.38 41.776 376.835 42 376.192 42C375.55 42 375.005 41.776 374.557 41.328ZM366.808 45.5C366.303 45.5 365.875 45.325 365.525 44.975C365.175 44.625 365 44.1974 365 43.6923V30.3078C365 29.8026 365.175 29.375 365.525 29.025C365.875 28.675 366.303 28.5 366.808 28.5H368.192V26.3848H369.731V28.5H377.308V26.3848H378.808V28.5H380.192C380.697 28.5 381.125 28.675 381.475 29.025C381.825 29.375 382 29.8026 382 30.3078V43.6923C382 44.1974 381.825 44.625 381.475 44.975C381.125 45.325 380.697 45.5 380.192 45.5H366.808ZM366.808 44H380.192C380.269 44 380.34 43.9679 380.404 43.9038C380.468 43.8398 380.5 43.7693 380.5 43.6923V34.3078H366.5V43.6923C366.5 43.7693 366.532 43.8398 366.596 43.9038C366.66 43.9679 366.731 44 366.808 44ZM366.5 32.8078H380.5V30.3078C380.5 30.2308 380.468 30.1603 380.404 30.0963C380.34 30.0321 380.269 30 380.192 30H366.808C366.731 30 366.66 30.0321 366.596 30.0963C366.532 30.2308 366.5 30.3078V32.8078Z" fill="currentColor" />
  </svg>
);

const ListViewIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size * (18 / 21)} viewBox="0 0 21 18" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M6.13333 13.1C5.58333 13.1 5.1125 12.9042 4.72083 12.5125C4.32917 12.1208 4.13333 11.65 4.13333 11.1V2C4.13333 1.45 4.32917 0.979167 4.72083 0.5875C5.1125 0.195833 5.58333 0 6.13333 0H18.1333C18.6833 0 19.1542 0.195833 19.5458 0.5875C19.9375 0.979167 20.1333 1.45 20.1333 2V11.1C20.1333 11.65 19.9375 12.1208 19.5458 12.5125C19.1542 12.9042 18.6833 13.1 18.1333 13.1H6.13333ZM6.13333 11.1H18.1333V2H6.13333V11.1ZM15.1333 6C15.4167 6 15.6542 5.90417 15.8458 5.7125C16.0375 5.52083 16.1333 5.28333 16.1333 5C16.1333 4.71667 16.0375 4.47917 15.8458 4.2875C15.6542 4.09583 15.4167 4 15.1333 4H9.10833C8.825 4 8.59167 4.09583 8.40833 4.2875C8.225 4.47917 8.13333 4.71667 8.13333 5C8.13333 5.28333 8.22917 5.52083 8.42083 5.7125C8.6125 5.90417 8.85 6 9.13333 6H15.1333ZM12.1333 9C12.4167 9 12.6542 8.90417 12.8458 8.7125C13.0375 8.52083 13.1333 8.28333 13.1333 8C13.1333 7.71667 13.0375 7.47917 12.8458 7.2875C12.6542 7.09583 12.4167 7 12.1333 7H9.10833C8.825 7 8.59167 7.09583 8.40833 7.2875C8.225 7.47917 8.13333 7.71667 8.13333 8C8.13333 8.28333 8.22917 8.52083 8.42083 8.7125C8.6125 8.90417 8.85 9 9.13333 9H12.1333ZM3.58333 17.975C3.03333 18.0583 2.54167 17.9333 2.10833 17.6C1.675 17.2667 1.41667 16.825 1.33333 16.275L0.00833333 6.375C-0.025 6.09167 0.0416667 5.84167 0.208333 5.625C0.375 5.40833 0.6 5.28333 0.883333 5.25C1.15 5.21667 1.39167 5.27917 1.60833 5.4375C1.825 5.59583 1.95 5.81667 1.98333 6.1L3.38333 16L10.2333 15.05L14.3333 14.475C14.6333 14.425 14.9 14.5 15.1333 14.7C15.3667 14.9 15.4833 15.1583 15.4833 15.475C15.4833 15.725 15.4 15.9458 15.2333 16.1375C15.0667 16.3292 14.8583 16.4417 14.6083 16.475L3.58333 17.975Z" fill="currentColor" />
  </svg>
);

const CompletedMeetingsIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="24 24 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M29.3077 45.5C28.8026 45.5 28.375 45.325 28.025 44.975C27.675 44.625 27.5 44.1974 27.5 43.6923V30.3078C27.5 29.8026 27.675 29.375 28.025 29.025C28.375 28.675 28.8026 28.5 29.3077 28.5H30.6923V26.3848H32.2308V28.5H39.8077V26.3848H41.3077V28.5H42.6923C43.1974 28.5 43.625 28.675 43.975 29.025C44.325 29.375 44.5 29.8026 44.5 30.3078V43.6923C44.5 44.1974 44.325 44.625 43.975 44.975C43.625 45.325 43.1974 45.5 42.6923 45.5H29.3077ZM29.3077 44H42.6923C42.7692 44 42.8398 43.9679 42.9038 43.9038C42.9679 43.8398 43 43.7693 43 43.6923V34.3078H29V43.6923C29 43.7693 29.0321 43.8398 29.0963 43.9038C29.1603 43.9679 29.2307 44 29.3077 44ZM29 32.8078H43V30.3078C43 30.2308 42.9679 30.1603 42.9038 30.0963C42.8398 30.0321 42.7692 30 42.6923 30H29.3077C29.2307 30 29.1603 30.0321 29.0963 30.0963C29.0321 30.1603 29 30.2308 29 30.3078V32.8078ZM31.25 37.75V36.25H40.75V37.75H31.25ZM31.25 41.75V40.25H37.75V41.75H31.25Z" fill="currentColor" />
  </svg>
);

const NextMeetingIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="361.5 24 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M375.798 38.149C376.487 37.7483 377.042 37.2179 377.463 36.5577C376.911 36.1321 376.299 35.8077 375.627 35.5848C374.955 35.3616 374.245 35.25 373.499 35.25C372.753 35.25 372.044 35.3616 371.371 35.5848C370.699 35.8077 370.087 36.1321 369.536 36.5577C369.956 37.2179 370.511 37.7483 371.2 38.149C371.889 38.5497 372.656 38.75 373.499 38.75C374.343 38.75 375.109 38.5497 375.798 38.149ZM373.499 33.75C373.985 33.75 374.398 33.5798 374.739 33.2395C375.079 32.899 375.249 32.4858 375.249 32C375.249 31.5142 375.079 31.101 374.739 30.7605C374.398 30.4202 373.985 30.25 373.499 30.25C373.013 30.25 372.6 30.4202 372.26 30.7605C371.919 31.101 371.749 31.5142 371.749 32C371.749 32.4858 371.919 32.899 372.26 33.2395C372.6 33.5798 373.013 33.75 373.499 33.75ZM373.499 43.5135C375.456 41.7622 376.953 40.0823 377.99 38.474C379.028 36.8657 379.547 35.457 379.547 34.248C379.547 32.425 378.968 30.9263 377.81 29.752C376.651 28.5777 375.215 27.9905 373.499 27.9905C371.784 27.9905 370.347 28.5777 369.189 29.752C368.03 30.9263 367.451 32.425 367.451 34.248C367.451 35.457 367.97 36.8657 369.008 38.474C370.046 40.0823 371.543 41.7622 373.499 43.5135ZM373.499 45.5095C370.983 43.3288 369.095 41.2994 367.838 39.4212C366.58 37.5429 365.951 35.8185 365.951 34.248C365.951 31.9403 366.698 30.0721 368.19 28.6432C369.683 27.2144 371.453 26.5 373.499 26.5C375.545 26.5 377.315 27.2144 378.808 28.6432C380.301 30.0721 381.047 31.9403 381.047 34.248C381.047 35.8185 380.418 37.5429 379.161 39.4212C377.903 41.2994 376.016 43.3288 373.499 45.5095Z" fill="currentColor" />
  </svg>
);

const MoreVertIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M10 5.83333C10.9167 5.83333 11.6667 5.08333 11.6667 4.16667C11.6667 3.25 10.9167 2.5 10 2.5C9.08333 2.5 8.33333 3.25 8.33333 4.16667C8.33333 5.08333 9.08333 5.83333 10 5.83333ZM10 8.33333C9.08333 8.33333 8.33333 9.08333 8.33333 10C8.33333 10.9167 9.08333 11.6667 10 11.6667C10.9167 11.6667 11.6667 10.9167 11.6667 10C11.6667 9.08333 10.9167 8.33333 10 8.33333ZM10 14.1667C9.08333 14.1667 8.33333 14.9167 8.33333 15.8333C8.33333 16.75 9.08333 17.5 10 17.5C10.9167 17.5 11.6667 16.75 11.6667 15.8333C11.6667 14.9167 10.9167 14.1667 10 14.1667Z" fill="#1C1B1F" />
  </svg>
);

// Also drives the contact profile's Meetings tab: pass `contactId` /
// `contactName` (plus that contact's `companyId`, which the Client Contacts
// picker needs) and it scopes itself to that contact's meetings. Same table,
// filters, bulk strip, form and details modal either way.
export default function CompanyMeetingsTab({ companyId, companyName, contactId, contactName, dealId, dealName, meetings = [], setMeetings, showStats = true, isLoading = false, autoOpenCreate = false, onAutoOpenCreateConsumed }) {
  const [searchTerm, setSearchTerm] = useState("");
  const {
    containerRef: fillContainerRef,
    footerRef: fillFooterRef,
    style: fillStyle,
  } = useFillToBottom();
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false);
  const [bulkStatusValue, setBulkStatusValue] = useState("");
  const [users, setUsers] = useState([]);
  const [manualMeetingFormOpen, setManualMeetingFormOpen] = useState(false);
  // Derived rather than copied into local state on a one-shot effect — a
  // copy raced the initial data load (whichever re-rendered first won) and
  // could get clobbered before ever becoming visible.
  const [editingMeeting, setEditingMeeting] = useState(null);
  const showMeetingForm = manualMeetingFormOpen || autoOpenCreate || !!editingMeeting;
  const closeMeetingForm = () => {
    // Editing a meeting updates it directly via API.put inside
    // CompanyMeetingForm (there's no onUpdate callback like the Task form
    // has), so the list needs an explicit refetch here to pick up the change.
    if (editingMeeting) refetchMeetings();
    setManualMeetingFormOpen(false);
    setEditingMeeting(null);
    if (autoOpenCreate) onAutoOpenCreateConsumed?.();
  };
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [openRowActionsId, setOpenRowActionsId] = useState(null);
  const [rowActionsPos, setRowActionsPos] = useState(null);
  const rowActionsRef = useRef(null);
  const [meetingToDelete, setMeetingToDelete] = useState(null);
  const [deletingMeeting, setDeletingMeeting] = useState(false);
  const [viewMode, setViewMode] = useState("list");
  const [hiddenColumns, setHiddenColumns] = useState(new Set());
  const [leftPinned, setLeftPinned] = useState(new Set());
  const [rightPinned, setRightPinned] = useState(new Set());
  const [openColumnMenuKey, setOpenColumnMenuKey] = useState(null);
  const [columnMenuPos, setColumnMenuPos] = useState(null);
  const columnMenuRef = useRef(null);

  const BASE_COLUMNS = useMemo(() => [
    { id: "title", label: "Meeting Title", pinnable: true, firstCol: true },
    { id: "type", label: "Type", pinnable: true, firstCol: true },
    { id: "dateTime", label: "Date & Time", pinnable: true },
    { id: "duration", label: "Duration", pinnable: true },
    { id: "attendees", label: "Attendees", pinnable: true },
    { id: "organiser", label: "Organiser", pinnable: true },
    { id: "relatedTo", label: "₹ Related to", pinnable: true },
    { id: "status", label: "Status", pinnable: true },
  ], []);

  const [columnOrder, setColumnOrder] = useState(() => BASE_COLUMNS.map(c => c.id));
  const [draggedColKey, setDraggedColKey] = useState(null);
  const [dragOverColKey, setDragOverColKey] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  const dragOverRef = useRef(null);
  const ghostElRef = useRef(null);

  const orderedColumns = useMemo(() => {
    const sortedBase = [...BASE_COLUMNS].sort((a, b) => columnOrder.indexOf(a.id) - columnOrder.indexOf(b.id));
    const visible = sortedBase.filter((c) => !hiddenColumns.has(c.id));
    const left = visible.filter((c) => leftPinned.has(c.id));
    const right = visible.filter((c) => rightPinned.has(c.id));
    const unpinned = visible.filter((c) => !leftPinned.has(c.id) && !rightPinned.has(c.id));
    return [...left, ...unpinned, ...right];
  }, [BASE_COLUMNS, hiddenColumns, leftPinned, rightPinned, columnOrder]);

  const pinColumnToSide = (colId, side) => {
    if (side === "left") {
      setLeftPinned((prev) => new Set(prev).add(colId));
      setRightPinned((prev) => { const next = new Set(prev); next.delete(colId); return next; });
    } else {
      setRightPinned((prev) => new Set(prev).add(colId));
      setLeftPinned((prev) => { const next = new Set(prev); next.delete(colId); return next; });
    }
  };

  const unpinColumn = (colId) => {
    setLeftPinned((prev) => { const next = new Set(prev); next.delete(colId); return next; });
    setRightPinned((prev) => { const next = new Set(prev); next.delete(colId); return next; });
  };

  const toggleHideColumn = (colId) => {
    setHiddenColumns((prev) => { const next = new Set(prev); next.add(colId); return next; });
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
    let positionGhost = () => { };

    const beginDrag = () => {
      dragStarted = true;
      e.preventDefault();
      window.getSelection?.()?.removeAllRanges();
      const rect = th.getBoundingClientRect();
      const label = BASE_COLUMNS.find((vc) => vc.id === colId)?.label || colId;

      const previewRows = (meetings || []).slice(0, 10).map((m) => {
        let val = m[colId];
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
    title: 212,
    type: 160,
    dateTime: 209,
    duration: 113,
    attendees: 140,
    organiser: 144,
    relatedTo: 155,
    status: 213,
  });
  const [resizingCol, setResizingCol] = useState(null);
  const resizingRef = useRef(null);
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

  const togglePinColumn = (colId) => {
    if (getColumnPinSide(colId)) unpinColumn(colId);
    else pinColumnToSide(colId, "left");
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

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await API.get(`/contacts/company/${companyId}`);
        setUsers(res.data || []);
      } catch (err) {
        console.error("Failed to load contacts:", err);
      }
    };
    if (companyId) fetchUsers();
  }, [companyId]);

  // Org staff — distinct from `users` above (which, despite the name, is
  // actually this company's client-side contacts). Meetings need both:
  // internal team picks from staffUsers, Client Contacts picks from users.
  const [staffUsers, setStaffUsers] = useState([]);
  useEffect(() => {
    const fetchStaffUsers = async () => {
      try {
        const res = await API.get("/auth/all-user");
        setStaffUsers(res.data?.allUsers || []);
      } catch (err) {
        console.error("Failed to load staff users:", err);
      }
    };
    fetchStaffUsers();
  }, []);

  const refetchMeetings = async () => {
    try {
      const res = await API.get("/meetings", {
        params: contactId ? { contactId } : dealId ? { dealId } : { companyId },
      });
      setMeetings(res.data.meetings);
    } catch (err) {
      console.error("Failed to refetch meetings:", err);
    }
  };

  const handleMeetingSave = async (meetingData) => {
    try {
      await API.post("/meetings", meetingData);
      await refetchMeetings();
      toast.success("Meeting created successfully!");
      closeMeetingForm();
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to create meeting.");
      }
      throw err;
    }
  };

  const handleMeetingComplete = async (meeting) => {
    try {
      await API.put(`/meetings/${meeting._id}`, { status: "completed" });
      await refetchMeetings();
      setSelectedMeeting((prev) => (prev && prev._id === meeting._id ? { ...prev, status: "completed" } : prev));
      toast.success("Meeting marked as complete!");
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to update meeting.");
      }
    }
  };

  const handleMeetingDelete = async (meetingId) => {
    try {
      await API.delete(`/meetings/${meetingId}`);
      await refetchMeetings();
      toast.success("Meeting deleted successfully!");
      setIsDetailsOpen(false);
      setSelectedMeeting(null);
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to delete meeting.");
      }
      throw err;
    }
  };

  const handleMeetingClick = (meeting) => {
    setSelectedMeeting(meeting);
    setIsDetailsOpen(true);
  };

  const handleEditMeeting = (meeting) => {
    setIsDetailsOpen(false);
    setEditingMeeting(meeting);
  };

  const handleDeleteMeetingConfirmed = async () => {
    if (!meetingToDelete) return;
    setDeletingMeeting(true);
    try {
      await handleMeetingDelete(meetingToDelete._id);
      setMeetingToDelete(null);
    } catch {
      // handleMeetingDelete already surfaced a toast for the failure.
    } finally {
      setDeletingMeeting(false);
    }
  };

  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const handleSort = (key, direction) => {
    if (direction) {
      setSortConfig((prev) =>
        prev.key === key && prev.direction === direction
          ? { key: null, direction: null }
          : { key, direction },
      );
      return;
    }
    setSortConfig((prev) => {
      if (prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return { key: null, direction: null };
    });
  };
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState({});

  const getMeetingFieldValue = (meeting, key) => {
    switch (key) {
      case "title":
        return meeting.title || "Untitled Meeting";
      case "type":
        return MEETING_TYPE_LABELS[meeting.meetingType] || meeting.meetingType || "General";
      case "dateTime":
        return getDateRangeLabel(meeting.scheduledAt);
      case "duration":
        return meeting.duration || 0;
      case "attendees":
        return meeting.participants?.length || 0;
      case "organiser":
        return typeof meeting.createdBy === "object" ? meeting.createdBy?.name || "" : "";
      case "relatedTo":
        return meeting.dealCode || meeting.company?.name || "";
      case "status":
        return MEETING_STATUS_LABELS[meeting.status] || meeting.status || "Scheduled";
      default:
        return meeting[key];
    }
  };

  // Every column the table renders, flattened to one searchable string. Built from
  // BASE_COLUMNS + getMeetingFieldValue (the accessor the columns and sorting use) so
  // a new column can't silently drop out of search, plus what the cells show that the
  // accessor doesn't: the raw meetingType, all participant names, the formatted
  // date/time, "<n> min" duration, and the amount.
  const getMeetingSearchText = (meeting) => {
    const parts = BASE_COLUMNS.map((c) => getMeetingFieldValue(meeting, c.id));
    parts.push(meeting.meetingType || "General");
    parts.push(meeting.participants?.map((p) => p?.name || "").join(" ") || "");
    if (meeting.scheduledAt) {
      const d = new Date(meeting.scheduledAt);
      parts.push(d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" }));
      parts.push(d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    }
    if (meeting.duration) parts.push(`${meeting.duration} min`);
    if (meeting.amount) parts.push(`₹${Number(meeting.amount).toLocaleString("en-IN")}`);
    return parts.filter((v) => v !== null && v !== undefined && v !== "").join(" ").toLowerCase();
  };

  const filteredMeetings = useMemo(() => {
    let result = meetings;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter((m) => getMeetingSearchText(m).includes(q));
    }
    return applyColumnFilters(result, selectedFilters, getMeetingFieldValue);
  }, [meetings, searchTerm, selectedFilters]);

  const sortedMeetings = useMemo(() => {
    if (!sortConfig.key) return filteredMeetings;
    return [...filteredMeetings].sort((a, b) => {
      let aVal = getMeetingFieldValue(a, sortConfig.key);
      let bVal = getMeetingFieldValue(b, sortConfig.key);
      if (sortConfig.key === "dateTime") {
        aVal = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
        bVal = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
      }
      const aCmp = typeof aVal === "number" ? aVal : (aVal || "").toString().toLowerCase();
      const bCmp = typeof bVal === "number" ? bVal : (bVal || "").toString().toLowerCase();
      if (aCmp < bCmp) return sortConfig.direction === "asc" ? -1 : 1;
      if (aCmp > bCmp) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredMeetings, sortConfig]);

  const { selectedItems, toggleItem, clearSelection, selectAll } = useBulkSelection({
    items: filteredMeetings,
    onDelete: () => setShowBulkDeleteModal(true)
  });

  // Keeps the bulk strip mounted for one beat after deselect so its
  // slide-out animation can play instead of vanishing on the same frame.
  const { visible: bulkStripVisible, closing: bulkStripClosing } =
    useBulkStrip(selectedItems.length);

  const [listPage, setListPage] = useState(1);
  const [listLimit, setListLimit] = useState(10);

  const listTotalCount = filteredMeetings.length;
  const listTotalPages = Math.max(1, Math.ceil(listTotalCount / listLimit));
  const listStartItem = listTotalCount === 0 ? 0 : (listPage - 1) * listLimit + 1;
  const listEndItem = Math.min(listPage * listLimit, listTotalCount);
  const hasListPrevPage = listPage > 1;
  const hasListNextPage = listPage < listTotalPages;

  const handleListPageChange = (page) => {
    if (page < 1 || page > listTotalPages) return;
    setListPage(page);
  };

  const handleExportSelected = () => {
    const dataToExport = meetings.filter(m => selectedItems.includes(m._id)).map(m => ({
      "Meeting Title": m.title || "",
      "Type": MEETING_TYPE_LABELS[m.meetingType] || m.meetingType || "General",
      "Date & Time": m.scheduledAt ? new Date(m.scheduledAt).toLocaleString() : "",
      "Duration": m.duration || "",
      "Status": MEETING_STATUS_LABELS[m.status] || m.status || "Scheduled",
    }));
    const headers = Object.keys(dataToExport[0] || {}).join(",");
    const rows = dataToExport.map(row => Object.values(row).map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    exportToCSV([headers, ...rows], `meetings_export_${new Date().toISOString().split("T")[0]}.csv`);
  };

  const handleBulkDelete = async () => {
    setBulkActionLoading(true);
    try {
      await bulkDelete("meetings", selectedItems);
      await refetchMeetings();
      toast.success(`${selectedItems.length} meeting(s) deleted`);
      clearSelection();
      setShowBulkDeleteModal(false);
    } catch (error) {
      console.error("Bulk delete failed:", error);
      toast.error("Failed to delete meetings");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkUpdateStatus = async () => {
    if (!bulkStatusValue) return;
    setBulkActionLoading(true);
    try {
      await Promise.all(selectedItems.map(id => API.patch(`/meetings/${id}`, { status: bulkStatusValue })));
      await refetchMeetings();
      toast.success(`Status updated for ${selectedItems.length} meeting(s)`);
      clearSelection();
      setShowBulkStatusModal(false);
    } catch (error) {
      console.error("Bulk update failed:", error);
      toast.error("Failed to update meetings");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleSelectAllAcrossPages = () => selectAll(filteredMeetings);

  const handleListLimitChange = (newLimit) => {
    setListLimit(newLimit);
    setListPage(1);
  };

  const getListPageNumbers = () => {
    const items = [1];
    if (listPage > 2) items.push("left-dots");
    if (listPage !== 1 && listPage !== listTotalPages) items.push(listPage);
    if (listPage < listTotalPages - 1) items.push("right-dots");
    if (listTotalPages > 1) items.push(listTotalPages);
    return items;
  };

  const paginatedMeetings = useMemo(
    () => sortedMeetings.slice((listPage - 1) * listLimit, listPage * listLimit),
    [sortedMeetings, listPage, listLimit],
  );

  const now = new Date();
  const in15Days = new Date();
  in15Days.setDate(in15Days.getDate() + 15);

  const total = meetings.length;
  const upcoming = meetings.filter(
    (m) => m.scheduledAt && new Date(m.scheduledAt) >= now,
  );
  const upcomingIn15 = upcoming.filter(
    (m) => new Date(m.scheduledAt) <= in15Days,
  ).length;
  const completed = meetings.filter(
    (m) => m.scheduledAt && new Date(m.scheduledAt) < now,
  ).length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const nextMeeting = [...upcoming].sort(
    (a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt),
  )[0];

  const nextMeetingLabel = (() => {
    if (!nextMeeting) return "—";
    const d = new Date(nextMeeting.scheduledAt);
    const isTomorrow =
      d.toDateString() ===
      new Date(now.getTime() + 24 * 60 * 60 * 1000).toDateString();
    const isToday = d.toDateString() === now.toDateString();
    const dayLabel = isToday
      ? "Today"
      : isTomorrow
        ? "Tomorrow"
        : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const time = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${dayLabel} • ${time}`;
  })();

  const kpiTiles = [
    {
      label: "Total Meetings",
      value: total,
      icon: TotalMeetingsIcon,
      subtitle: "Since Onboarding",
      subtitleClass: "text-gray-400",
    },
    {
      label: "Upcoming",
      value: upcomingIn15,
      icon: UpcomingMeetingsIcon,
      subtitle: "Next 15 Days",
      subtitleClass: "text-blue-500",
    },
    {
      label: "Completed",
      value: completed,
      icon: CompletedMeetingsIcon,
      subtitle: `${completionRate}% Completion Rate`,
      subtitleClass: "text-green-600",
    },
    {
      label: "Next Meeting",
      value: nextMeetingLabel,
      icon: NextMeetingIcon,
      valueSmall: true,
    },
  ];

  return (
    <div>
      {/* KPI Tiles */}
      {showStats && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <StatTileSkeleton key={i} />)
            ) : (
              kpiTiles.map((tile) => (
                <StatTile key={tile.label} tile={tile} />
              )))}
          </div>

          <div className="-mx-6" style={{ marginTop: 24, paddingBottom: 24, borderTop: "1px solid #E1E4EA" }} />
        </>
      )}

      {/* Search + Controls */}
      {isLoading ? (
        <div className="flex items-center gap-4 mb-4" style={{ height: "44px" }}>
          <Skeleton height={44} shape="rect" className="flex-1 rounded-full" />
          <Skeleton height={44} width={96} shape="rect" className="rounded-full flex-shrink-0" />
          <Skeleton height={44} width={86} shape="rect" className="rounded-full flex-shrink-0" />
          <Skeleton height={44} width={44} shape="circle" className="flex-shrink-0" />
        </div>
      ) : viewMode === "list" && bulkStripVisible ? (
        <BulkActionBar
          isClosing={bulkStripClosing}
          selectedCount={selectedItems.length}
          entityName="meeting"
          onSelectAll={handleSelectAllAcrossPages}
          onDeselectAll={clearSelection}
          onExport={handleExportSelected}
          onUpdateStatus={() => setShowBulkStatusModal(true)}
          onDelete={() => setShowBulkDeleteModal(true)}
          onCancel={clearSelection}
        />
      ) : (
        <div className="flex flex-wrap lg:flex-nowrap items-center gap-4 mb-4" style={{ minHeight: "44px" }}>
          <div className="relative flex-1 min-w-[180px] h-[44px]">
            <SearchIcon className="absolute left-3.5 -translate-y-1/2 top-1/2 w-4 h-4 text-[#525866]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search meetings by title, deal, or participants..."
              className="w-full h-full pl-11 pr-3.5 border border-[rgba(31,41,55,0.1)] rounded-full text-sm focus:outline-none focus:border-[#0085FF]"
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
          <ToolbarFilterGroup
            isOpen={showFilterPanel}
            columns={MEETING_FILTER_COLUMNS}
            data={meetings}
            getFieldValue={getMeetingFieldValue}
            selected={selectedFilters}
            onApply={setSelectedFilters}
          />
          <button
            onClick={() => setShowFilterPanel((open) => !open)}
            aria-expanded={showFilterPanel}
            className={`relative flex items-center justify-center gap-2 px-3 text-sm font-medium bg-white border rounded-full hover:bg-gray-50 flex-shrink-0 transition-colors ${showFilterPanel ? "text-[#0085FF]" : "text-gray-800"
              }`}
            style={{
              height: "44px",
              borderColor: showFilterPanel || Object.values(selectedFilters).flat().length > 0 ? "#0085FF" : "#E1E4EA",
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
          <div className="relative flex items-center gap-1.5 p-1 bg-[#F1F1F5] rounded-full flex-shrink-0 overflow-hidden" style={{ height: "44px" }}>
            <span
              className="absolute top-1 w-9 h-9 rounded-full bg-white shadow-[0px_0px_6px_rgba(0,0,0,0.1)] transition-all duration-300 ease-out pointer-events-none"
              style={{ left: viewMode === "list" ? 46 : 4 }}
            />
            <button
              onClick={() => setViewMode("day")}
              title="Day view"
              className={`relative z-10 w-9 h-9 flex items-center justify-center rounded-full transition-colors ${viewMode === "day"
                  ? "text-[#0085FF]"
                  : "text-gray-500 hover:text-gray-700"
                }`}
            >
              <DayViewIcon size={20} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              title="List view"
              className={`relative z-10 w-9 h-9 flex items-center justify-center rounded-full transition-colors ${viewMode === "list"
                  ? "text-[#0085FF]"
                  : "text-gray-500 hover:text-gray-700"
                }`}
            >
              <ListViewIcon size={15} />
            </button>
          </div>
          <button
            onClick={() => setManualMeetingFormOpen(true)}
            className="flex items-center justify-center rounded-full border hover:bg-gray-50 flex-shrink-0"
            style={{ width: "44px", height: "44px", borderColor: "#E1E4EA" }}
            title="Add Meeting"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Meeting list or empty state */}
      {!isLoading && meetings.length === 0 ? (
        <div className="flex items-center justify-center w-full min-h-[300px] bg-white border border-[#E1E4EA] rounded-xl">
          <EmptyState icon={TeamIcon} noun="Meeting" onCreate={() => setManualMeetingFormOpen(true)} />
        </div>
      ) : viewMode === "list" ? (
        <div
          ref={fillContainerRef}
          className="relative bg-white border border-[#E1E4EA] rounded-lg overflow-x-auto overflow-y-auto"
          style={fillStyle}
        >
          <table className="w-full border-separate border-spacing-0 text-left" style={{ tableLayout: "fixed", minWidth: totalTableWidth }}>
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
                    <Checkbox checked={selectedItems.length > 0 && selectedItems.length === paginatedMeetings.length} onChange={(e) => e.target.checked ? selectAll(paginatedMeetings) : clearSelection()} uncheckedColor="text-[#525866]" />
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
                      className={`py-2.5 font-medium text-[#525252] text-xs cursor-grab active:cursor-grabbing bg-[#F5F7FA] ${col.firstCol ? "pl-6 pr-3" : "px-3"
                        } ${isDragOver ? "bg-blue-100" : "hover:bg-gray-100"}`}
                    >
                      <div className={`flex items-center justify-between w-full ${isLoading ? "[&_button]:invisible" : ""}`}>
                        <div
                          className="relative flex items-center justify-start flex-1 group cursor-pointer select-none min-w-0"
                          onDoubleClick={() => togglePinColumn(col.id)}
                        >
                          <div className="flex items-center gap-1.5 flex-1 overflow-hidden">
                            {isLoading ? (
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
                          </div>
                        </div>

                        {/* Column menu trigger */}
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
                          className="ml-1 p-1 rounded hover:bg-gray-200 transition-colors text-gray-500 flex-shrink-0"
                          title="Column options"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>

                        {/* Column menu portal */}
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
                                  setListPage(1);
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
                                  setListPage(1);
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
                      </div>
                      <div
                        data-resize-handle="true"
                        onMouseDown={(e) => startResize(e, col.id)}
                        className={`absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-blue-400 z-10 ${resizingCol === col.id ? "bg-blue-500" : "bg-transparent"
                          }`}
                      />
                      {boundarySide && <div style={getPinnedBoundaryOverlayStyle(boundarySide)} />}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="bg-white">
              {isLoading ? (
                <TableSkeletonRows
                  columns={orderedColumns.map(c => colWidths[c.id])}
                  hasCheckbox={true}
                  numRows={listLimit}
                  rowHeight={54}
                />
              ) : paginatedMeetings.length === 0 ? (
                <tr>
                  <td colSpan={orderedColumns.length + 1}>
                    <EmptyState icon={TeamIcon} noun="Meeting" isFiltered />
                  </td>
                </tr>
              ) : (
                paginatedMeetings.map((meeting) => {
                  const isSelected = selectedItems.includes(meeting._id);
                  const attendees = [...(meeting.internalParticipants || []), ...(meeting.participants || [])];
                  const organizer = typeof meeting.createdBy === "object" ? meeting.createdBy : null;
                  const isActionsOpen = openRowActionsId === meeting._id;
                  const meetingActionsMenu = (
                    <div className="relative flex items-center justify-center flex-shrink-0" onMouseDown={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isActionsOpen) {
                            setOpenRowActionsId(null);
                            setRowActionsPos(null);
                            return;
                          }
                          // rect is VISUAL px; the menu is portaled into
                          // document.body, which paints inside the app's
                          // dynamic <html> zoom, so rect-derived values are
                          // divided by that zoom, the menu is centered on
                          // the row rather than hanging off an edge, and
                          // both axes are clamped to the viewport — same
                          // approach as the Deals/Tasks row-actions menus.
                          const zMenu = getAncestorZoom(document.body);
                          const MENU_W = 170;
                          const MENU_H = 110; // View Meeting + Edit Meeting + divider + Delete Meeting
                          const MARGIN = 8;

                          const rect = e.currentTarget.getBoundingClientRect();
                          const viewportH = window.innerHeight / zMenu;
                          const viewportW = window.innerWidth / zMenu;

                          const rowCenter = (rect.top + rect.bottom) / (2 * zMenu);
                          let calcTop = rowCenter - MENU_H / 2;
                          calcTop = Math.max(MARGIN, Math.min(calcTop, viewportH - MENU_H - MARGIN));

                          let calcLeft = rect.right / zMenu - MENU_W;
                          calcLeft = Math.min(calcLeft, viewportW - MENU_W - MARGIN);
                          calcLeft = Math.max(calcLeft, MARGIN);

                          setRowActionsPos({ top: calcTop, left: calcLeft });
                          setOpenRowActionsId(meeting._id);
                        }}
                        className="p-1 rounded hover:bg-gray-200 text-gray-800 flex-shrink-0"
                        title="More options"
                      >
                        <MoreVertIcon className="w-5 h-5" />
                      </button>

                      {isActionsOpen && rowActionsPos && createPortal(
                        <>
                          <div className="fixed inset-0 z-[9998]" onClick={() => { setOpenRowActionsId(null); setRowActionsPos(null); }} />
                          <div
                            ref={rowActionsRef}
                            style={{ position: "fixed", top: rowActionsPos.top, left: rowActionsPos.left }}
                            className="w-[170px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => {
                                setOpenRowActionsId(null);
                                setRowActionsPos(null);
                                handleMeetingClick(meeting);
                              }}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                            >
                              <EyeIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                              View Meeting
                            </button>
                            <button
                              onClick={() => {
                                setOpenRowActionsId(null);
                                setRowActionsPos(null);
                                handleEditMeeting(meeting);
                              }}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                            >
                              <EditIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                              Edit Meeting
                            </button>
                            <div className="w-full border-t border-[#F1F1F5] my-0.5" />
                            <button
                              onClick={() => {
                                setOpenRowActionsId(null);
                                setRowActionsPos(null);
                                setMeetingToDelete(meeting);
                              }}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-red-600 hover:bg-red-50 whitespace-nowrap"
                            >
                              <DeleteIcon className="w-4 h-4" />
                              Delete Meeting
                            </button>
                          </div>
                        </>,
                        document.body
                      )}
                    </div>
                  );
                  const cells = {
                    title: (
                      <td key="title" style={{ height: 60 }} className="pl-6 pr-3 border-r border-b border-[#E1E4EA]">
                        <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "20px", color: "#222530" }} className="truncate block">
                          <HighlightText text={meeting.title || "Untitled Meeting"} query={searchTerm} />
                        </span>
                      </td>
                    ),
                    type: (
                      <td key="type" style={{ height: 60 }} className="pl-6 pr-3 border-r border-b border-[#E1E4EA]">
                        <span
                          className="inline-flex items-center justify-center capitalize"
                          style={{
                            padding: "5px 12px",
                            borderRadius: 53,
                            backgroundColor: "rgba(0, 133, 255, 0.1)",
                            fontFamily: "Inter",
                            fontWeight: 500,
                            fontSize: 12,
                            lineHeight: "120%",
                            color: "#0085FF",
                          }}
                        >
                          <HighlightText text={meeting.meetingType || "General"} query={searchTerm} />
                        </span>
                      </td>
                    ),
                    dateTime: (
                      <td key="dateTime" style={{ height: 60 }} className="px-3 border-r border-b border-[#E1E4EA]">
                        <div className="flex flex-col">
                          <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "20px", color: "#525866" }} className="truncate">
                            {meeting.scheduledAt
                              ? new Date(meeting.scheduledAt).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })
                              : "—"}
                          </span>
                          <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "20px", color: "rgba(28, 28, 29, 0.5)" }} className="truncate">
                            {meeting.scheduledAt
                              ? new Date(meeting.scheduledAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
                              : "—"}
                          </span>
                        </div>
                      </td>
                    ),
                    duration: (
                      <td key="duration" style={{ height: 60 }} className="px-3 border-r border-b border-[#E1E4EA]">
                        <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "20px", color: "#525866" }}>
                          {meeting.duration ? <HighlightText text={`${meeting.duration} min`} query={searchTerm} /> : "—"}
                        </span>
                      </td>
                    ),
                    attendees: (
                      <td key="attendees" style={{ height: 60 }} className="px-3 border-r border-b border-[#E1E4EA]">
                        {attendees.length ? (
                          <div className="flex items-center">
                            {attendees.slice(0, 3).map((p, i) => (
                              <div
                                key={p._id || i}
                                className="rounded-full bg-gray-200 border border-white flex items-center justify-center text-[9px] font-semibold text-gray-600 flex-shrink-0"
                                style={{ width: 24, height: 24, marginLeft: i === 0 ? 0 : -8 }}
                              >
                                {(p.name || "?").charAt(0).toUpperCase()}
                              </div>
                            ))}
                            {attendees.length > 3 && (
                              <div
                                className="rounded-full bg-[#D9D9D9] border border-white flex items-center justify-center flex-shrink-0"
                                style={{ height: 24, padding: "0 6px", borderRadius: 12, marginLeft: -8 }}
                              >
                                <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 10, lineHeight: "120%", color: "#78788D", whiteSpace: "nowrap" }}>
                                  +{attendees.length - 3} more
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    ),
                    organiser: (
                      <td key="organiser" style={{ height: 60 }} className="px-3 border-r border-b border-[#E1E4EA]">
                        <div className="flex items-center" style={{ gap: 6 }}>
                          <div
                            className="rounded-full bg-blue-100 border border-white flex items-center justify-center text-[10px] font-semibold text-blue-700 flex-shrink-0"
                            style={{ width: 24, height: 24 }}
                          >
                            {organizer?.name?.charAt(0)?.toUpperCase() || "?"}
                          </div>
                          <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 12, lineHeight: "120%", color: "#1C1C1D" }} className="truncate">
                            <HighlightText text={organizer?.name || "Unknown"} query={searchTerm} />
                          </span>
                        </div>
                      </td>
                    ),
                    relatedTo: (
                      <td key="relatedTo" style={{ height: 60 }} className="px-3 border-r border-b border-[#E1E4EA]">
                        <div className="flex flex-col">
                          <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "20px", color: "#0085FF" }} className="truncate">
                            <HighlightText text={meeting.dealCode || meeting.company?.name || "—"} query={searchTerm} />
                          </span>
                          <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "20px", color: "#525866" }} className="truncate">
                            {meeting.amount ? `₹${Number(meeting.amount).toLocaleString("en-IN")}` : "—"}
                          </span>
                        </div>
                      </td>
                    ),
                    status: (
                      <td key="status" style={{ height: 60 }} className="px-3 border-b border-[#E1E4EA]">
                        <div className="flex items-center justify-between w-full" style={{ gap: 8 }}>
                          <span
                            className="inline-flex items-center justify-center capitalize"
                            style={{
                              padding: "5px 12px",
                              borderRadius: 53,
                              backgroundColor: meeting.status === "completed" ? "rgba(0, 201, 80, 0.1)" : "rgba(0, 133, 255, 0.1)",
                              fontFamily: "Inter",
                              fontWeight: 500,
                              fontSize: 12,
                              lineHeight: "120%",
                              color: meeting.status === "completed" ? "#00C950" : "#0085FF",
                            }}
                          >
                            <HighlightText text={meeting.status || "scheduled"} query={searchTerm} />
                          </span>
                        </div>
                      </td>
                    ),
                  };
                  return (
                    <tr
                      key={meeting._id}
                      onClick={() => handleMeetingClick(meeting)}
                      className={`hover:bg-gray-50 transition-colors group cursor-pointer ${isSelected ? "!bg-blue-50" : ""}`}
                    >
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
                        onClick={e => e.stopPropagation()}
                        className="px-3"
                      >
                        <div className="flex justify-center items-center w-full">
                          <Checkbox checked={isSelected} onChange={() => toggleItem(meeting._id)} />
                        </div>
                      </td>
                      {orderedColumns.map((col, colIdx) => {
                        const isDragging = draggedColKey === col.id;
                        const cell = cells[col.id];
                        if (!cell) return null;

                        const stickyStyle = getStickyStyle(col.id, false, isSelected);
                        const mergedStyle = {
                          ...cell.props.style,
                          opacity: isDragging ? 0.35 : undefined,
                          ...stickyStyle,
                        };

                        const cleanClassName = (cell.props.className || "")
                          .replace("border-r", "")
                          .replace("border-b", "")
                          .replace("border-[#E1E4EA]", "");

                        const boundarySide = getBoundaryShadowSide(col.id);
                        const isLastCol = colIdx === orderedColumns.length - 1;
                        return React.cloneElement(
                          cell,
                          { style: mergedStyle, className: cleanClassName },
                          <>
                            {isLastCol ? (
                              <div className="flex items-center justify-between w-full gap-2">
                                {cell.props.children}
                                {meetingActionsMenu}
                              </div>
                            ) : (
                              cell.props.children
                            )}
                            {boundarySide && <div style={getPinnedBoundaryOverlayStyle(boundarySide)} />}
                          </>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-row items-start" style={{ gap: 18, marginTop: 24 }}>
          <div
            className="flex flex-col items-start flex-shrink-0"
            style={{
              boxSizing: "border-box",
              padding: 20,
              gap: 24,
              width: 319,
              background: "#FFFFFF",
              border: "1px solid #E1E4EA",
              borderRadius: 14,
            }}
          >
            <div
              className="flex flex-row justify-between items-center self-stretch flex-shrink-0"
              style={{ padding: 0, gap: 24, width: 279, height: 17 }}
            >
              <span
                style={{
                  fontFamily: "Inter",
                  fontWeight: 600,
                  fontSize: 14,
                  lineHeight: "120%",
                  color: "#1C1C1D",
                }}
              >
                Calendar
              </span>
              <span
                style={{
                  fontFamily: "Inter",
                  fontWeight: 600,
                  fontSize: 12,
                  lineHeight: "120%",
                  color: "#0085FF",
                  cursor: "pointer",
                }}
              >
                View Calendar
              </span>
            </div>
            <div className="flex flex-row justify-between items-center self-stretch flex-shrink-0" style={{ padding: 0 }}>
              {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => (
                <span
                  key={day}
                  style={{
                    fontFamily: "Inter",
                    fontWeight: 500,
                    fontSize: 12,
                    lineHeight: "120%",
                    color: "#6B7280",
                  }}
                >
                  {day}
                </span>
              ))}
            </div>
            {(() => {
              const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
              const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
              const firstWeekday = (monthStart.getDay() + 6) % 7;
              const cells = [
                ...Array(firstWeekday).fill(null),
                ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
              ];
              const meetingDays = new Set(
                meetings
                  .filter((m) => m.scheduledAt)
                  .map((m) => new Date(m.scheduledAt))
                  .filter(
                    (d) =>
                      d.getFullYear() === now.getFullYear() &&
                      d.getMonth() === now.getMonth(),
                  )
                  .map((d) => d.getDate()),
              );
              return (
                <div
                  className="grid self-stretch flex-shrink-0"
                  style={{ gridTemplateColumns: "repeat(7, 1fr)", rowGap: 12 }}
                >
                  {cells.map((day, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col items-center justify-center"
                      style={{ width: 24, justifySelf: "center" }}
                    >
                      {day && meetingDays.has(day) && (
                        <span
                          className="flex-shrink-0"
                          style={{ width: 6, height: 6, borderRadius: 99, background: "#0085FF", marginBottom: 2 }}
                        />
                      )}
                      {day && (
                        <span
                          className="flex items-center justify-center"
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 99,
                            fontFamily: "Inter Tight",
                            fontWeight: 400,
                            fontSize: 14,
                            lineHeight: "17px",
                            background: day === now.getDate() ? "#0085FF" : "transparent",
                            color: day === now.getDate() ? "#FFFFFF" : "#333333",
                          }}
                        >
                          {day}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
            <div style={{ width: 279, height: 0, border: "1px solid #E1E4EA", flexShrink: 0 }} />
            <span
              className="self-stretch flex-shrink-0"
              style={{
                fontFamily: "Inter",
                fontWeight: 600,
                fontSize: 14,
                lineHeight: "120%",
                color: "#1C1C1D",
              }}
            >
              Meeting Type Legend
            </span>
            <div
              className="grid self-stretch flex-shrink-0"
              style={{ gridTemplateColumns: "repeat(3, 1fr)", columnGap: 12, rowGap: 12 }}
            >
              {["Sales", "Meeting", "Demo", "Review", "Support", "Others"].map((label) => (
                <div key={label} className="flex items-center" style={{ gap: 4 }}>
                  <span
                    className="flex-shrink-0"
                    style={{ width: 10, height: 10, borderRadius: 9999, background: "#0085FF" }}
                  />
                  <span
                    className="truncate"
                    style={{
                      fontFamily: "Inter",
                      fontWeight: 600,
                      fontSize: 12,
                      lineHeight: "120%",
                      color: "#1C1C1D",
                    }}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-start flex-shrink-0" style={{ gap: 24 }}>
            <div
              className="flex flex-row items-center self-stretch flex-shrink-0"
              style={{ padding: 0, gap: 24, width: 989, height: 17 }}
            >
              <span
                style={{
                  fontFamily: "Inter",
                  fontWeight: 600,
                  fontSize: 14,
                  lineHeight: "120%",
                  color: "#1C1C1D",
                }}
              >
                Upcoming Meetings
              </span>
            </div>
            {(() => {
              const dotColors = ["#0085FF", "#34C759", "#FF8400"];
              const realUpcomingMeetings = [...meetings]
                .filter((m) => m.scheduledAt && new Date(m.scheduledAt) >= now)
                .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
                .slice(0, 3);
              if (realUpcomingMeetings.length === 0) return null;
              const upcomingMeetings = realUpcomingMeetings;
              return (
                <div className="relative flex-shrink-0" style={{ isolation: "isolate", width: 994 }}>
                  {upcomingMeetings.map((meeting, idx) => {
                    const start = new Date(meeting.scheduledAt);
                    const duration = meeting.duration || 30;
                    const end = new Date(start.getTime() + duration * 60000);
                    const color = dotColors[idx % dotColors.length];
                    const isFirst = idx === 0;
                    const isLast = idx === upcomingMeetings.length - 1;
                    return (
                      <div
                        key={`${meeting._id}-${idx}`}
                        className="relative flex flex-row items-center"
                        style={{ gap: 12, width: "100%" }}
                      >
                        {/* Connector line: each row draws only the portion between
                          its own top/bottom edge and its own dot's center, sized
                          in percentages of THIS row's actual (content-driven)
                          height — so it lines up exactly regardless of how tall
                          any individual card renders. */}
                        {!isFirst && (
                          <div className="absolute" style={{ width: 1, left: 4, top: 0, height: "50%", background: "#E7E7E9" }} />
                        )}
                        {!isLast && (
                          <div className="absolute" style={{ width: 1, left: 4, top: "50%", height: "50%", background: "#E7E7E9" }} />
                        )}
                        <span
                          className="relative flex-shrink-0"
                          style={{ width: 10, height: 10, borderRadius: 9999, background: color, zIndex: 1 }}
                        />
                        <div
                          className="flex flex-col justify-center items-start flex-1"
                          style={{
                            boxSizing: "border-box",
                            padding: 24,
                            gap: 10,
                            minHeight: 120,
                            border: "1px solid #E1E4EA",
                            borderTop: isFirst ? "1px solid #E1E4EA" : "none",
                            borderRadius: `${isFirst ? "8px 8px" : "0 0"} ${isLast ? "8px 8px" : "0 0"}`,
                          }}
                        >
                          <div className="flex flex-row items-start" style={{ gap: 95, width: "100%" }}>
                            <div className="flex flex-col justify-center items-center flex-shrink-0" style={{ width: 44, gap: 4 }}>
                              <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 12, lineHeight: "120%", color: "#1C1C1D", textAlign: "center" }}>
                                {start.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
                              </span>
                              <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 32, lineHeight: "120%", color: "#1C1C1D", textAlign: "center" }}>
                                {start.getDate()}
                              </span>
                              <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 10, lineHeight: "120%", color: "#78788D", textAlign: "center" }}>
                                {start.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}
                              </span>
                            </div>
                            <div className="flex flex-col items-start flex-shrink-0" style={{ width: 240, gap: 8 }}>
                              <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 16, lineHeight: "120%", color: "#1C1C1D" }} className="truncate">
                                {meeting.title || "Untitled Meeting"}
                              </span>
                              <div className="flex flex-row items-center flex-shrink-0" style={{ gap: 8 }}>
                                <AlarmClock size={14} style={{ color: "#78788D" }} />
                                <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 10, lineHeight: "120%", color: "#78788D" }}>
                                  {start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} - {end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} ({duration} mins)
                                </span>
                              </div>
                              {(() => {
                                const attendees = [...(meeting.internalParticipants || []), ...(meeting.participants || [])];
                                const visibleAttendees = attendees.slice(0, 3);
                                const extraAttendees = attendees.length - visibleAttendees.length;
                                if (attendees.length === 0) return null;
                                return (
                                  <div className="flex flex-row items-center flex-shrink-0" style={{ gap: 12 }}>
                                    <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 10, lineHeight: "120%", color: "#78788D" }}>
                                      Attendees
                                    </span>
                                    <div className="flex flex-row items-center flex-shrink-0">
                                      {visibleAttendees.map((att, i) => (
                                        <div
                                          key={att._id || i}
                                          className="flex items-center justify-center flex-shrink-0"
                                          style={{
                                            width: 20,
                                            height: 20,
                                            borderRadius: "50%",
                                            background: "#D9D9D9",
                                            border: "1px solid #FFFFFF",
                                            marginLeft: i === 0 ? 0 : -4,
                                          }}
                                        >
                                          <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 10, color: "#78788D" }}>
                                            {(att.name || "?").charAt(0).toUpperCase()}
                                          </span>
                                        </div>
                                      ))}
                                      {extraAttendees > 0 && (
                                        <div
                                          className="flex items-center justify-center flex-shrink-0"
                                          style={{
                                            height: 20,
                                            padding: "0 6px",
                                            borderRadius: 10,
                                            background: "#D9D9D9",
                                            border: "1px solid #FFFFFF",
                                            marginLeft: -4,
                                          }}
                                        >
                                          <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 10, color: "#78788D", whiteSpace: "nowrap" }}>
                                            +{extraAttendees} more
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                            <div className="flex flex-col items-start flex-shrink-0" style={{ gap: 4 }}>
                              <span
                                className="inline-flex items-center justify-center flex-shrink-0"
                                style={{
                                  padding: "5px 12px",
                                  borderRadius: 53,
                                  background: "rgba(0, 133, 255, 0.1)",
                                  fontFamily: "Inter",
                                  fontWeight: 500,
                                  fontSize: 12,
                                  lineHeight: "120%",
                                  color: "#0085FF",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                Upcoming
                              </span>
                              <div className="flex flex-row items-center flex-shrink-0" style={{ gap: 8 }}>
                                <span
                                  className="flex items-center justify-center flex-shrink-0"
                                  style={{ width: 16, height: 16, background: "#E1E4EA", borderRadius: 103 }}
                                >
                                  <VideoIcon className="w-2.5 h-2.5" style={{ color: "#000000" }} />
                                </span>
                                <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 10, lineHeight: "120%", color: "#78788D" }} className="capitalize">
                                  {meeting.meetingType?.replace("-", " ") || "General"}
                                </span>
                              </div>
                              {meeting.company?.name && (
                                <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 10, lineHeight: "120%", color: "#78788D" }} className="truncate">
                                  Related to: {meeting.company.name}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-row items-center flex-shrink-0 flex-1 justify-end" style={{ gap: 8 }}>
                              <div
                                className="flex items-center justify-center flex-shrink-0"
                                style={{ width: 32, height: 32, borderRadius: "50%", background: "#D9D9D9", border: "1px solid #FFFFFF" }}
                              >
                                <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 12, color: "#78788D" }}>
                                  {(meeting.createdBy?.name || "?").charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div className="flex flex-col items-start" style={{ minWidth: 120 }}>
                                <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 12, lineHeight: "120%", color: "#1C1C1D" }} className="truncate">
                                  {meeting.createdBy?.name || "Unassigned"}
                                </span>
                                <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 10, lineHeight: "120%", color: "#78788D" }}>
                                  Organiser
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleMeetingClick(meeting); }}
                                className="flex items-center justify-center flex-shrink-0 hover:bg-gray-100 rounded-lg transition-colors"
                                style={{ marginLeft: 12, padding: 4 }}
                                title="View meeting"
                              >
                                <EyeIcon size={16} style={{ color: "#78788D" }} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            <div className="flex flex-row items-center self-stretch flex-shrink-0" style={{ padding: 0, gap: 12 }}>
              <span
                className="flex-shrink-0"
                style={{ width: 10, height: 10, borderRadius: 9999, background: "#0085FF" }}
              />
              <span
                onClick={() => setViewMode("list")}
                style={{
                  fontFamily: "Inter",
                  fontWeight: 600,
                  fontSize: 12,
                  lineHeight: "120%",
                  color: "#0085FF",
                  cursor: "pointer",
                }}
              >
                View All Upcoming Meetings
              </span>
            </div>
            <div
              className="flex flex-row items-center self-stretch flex-shrink-0"
              style={{ padding: 0, gap: 24, width: 989, height: 17 }}
            >
              <span
                style={{
                  fontFamily: "Inter",
                  fontWeight: 600,
                  fontSize: 14,
                  lineHeight: "120%",
                  color: "#1C1C1D",
                }}
              >
                Completed Meetings
              </span>
            </div>
            {(() => {
              const dotColors = ["#0085FF", "#34C759", "#FF8400"];
              const realCompletedMeetings = [...meetings]
                .filter((m) => m.scheduledAt && new Date(m.scheduledAt) < now)
                .sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt))
                .slice(0, 3);
              if (realCompletedMeetings.length === 0) return null;
              const completedMeetings = realCompletedMeetings;
              return (
                <div className="relative flex-shrink-0" style={{ isolation: "isolate", width: 994 }}>
                  {isLoading ? (
                    [1, 2, 3].map((_, idx) => (
                      <div key={idx} className="relative flex flex-row items-center" style={{ gap: 12, width: "100%" }}>
                        {idx !== 0 && (
                          <div className="absolute" style={{ width: 1, left: 4, top: 0, height: "50%", background: "#E7E7E9" }} />
                        )}
                        {idx !== 2 && (
                          <div className="absolute" style={{ width: 1, left: 4, top: "50%", height: "50%", background: "#E7E7E9" }} />
                        )}
                        <span className="relative flex-shrink-0" style={{ width: 10, height: 10, borderRadius: 9999, background: "#E1E4EA", zIndex: 1 }} />
                        <div
                          className="flex flex-col justify-center items-start flex-1"
                          style={{
                            boxSizing: "border-box", padding: 24, gap: 10, minHeight: 120, border: "1px solid #E1E4EA",
                            borderTop: idx === 0 ? "1px solid #E1E4EA" : "none",
                            borderRadius: `${idx === 0 ? "8px 8px" : "0 0"} ${idx === 2 ? "8px 8px" : "0 0"}`,
                          }}
                        >
                          <Skeleton height={20} width={200} className="mb-2" />
                          <Skeleton height={14} width={150} />
                        </div>
                      </div>
                    ))
                  ) : completedMeetings.map((meeting, idx) => {
                    const start = new Date(meeting.scheduledAt);
                    const duration = meeting.duration || 30;
                    const end = new Date(start.getTime() + duration * 60000);
                    const color = dotColors[idx % dotColors.length];
                    const isFirst = idx === 0;
                    const isLast = idx === completedMeetings.length - 1;
                    return (
                      <div
                        key={`${meeting._id}-${idx}`}
                        className="relative flex flex-row items-center"
                        style={{ gap: 12, width: "100%" }}
                      >
                        {!isFirst && (
                          <div className="absolute" style={{ width: 1, left: 4, top: 0, height: "50%", background: "#E7E7E9" }} />
                        )}
                        {!isLast && (
                          <div className="absolute" style={{ width: 1, left: 4, top: "50%", height: "50%", background: "#E7E7E9" }} />
                        )}
                        <span
                          className="relative flex-shrink-0"
                          style={{ width: 10, height: 10, borderRadius: 9999, background: color, zIndex: 1 }}
                        />
                        <div
                          className="flex flex-col justify-center items-start flex-1"
                          style={{
                            boxSizing: "border-box",
                            padding: 24,
                            gap: 10,
                            minHeight: 120,
                            border: "1px solid #E1E4EA",
                            borderTop: isFirst ? "1px solid #E1E4EA" : "none",
                            borderRadius: `${isFirst ? "8px 8px" : "0 0"} ${isLast ? "8px 8px" : "0 0"}`,
                          }}
                        >
                          <div className="flex flex-row items-start" style={{ gap: 95, width: "100%" }}>
                            <div className="flex flex-col justify-center items-center flex-shrink-0" style={{ width: 44, gap: 4 }}>
                              <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 12, lineHeight: "120%", color: "#1C1C1D", textAlign: "center" }}>
                                {start.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
                              </span>
                              <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 32, lineHeight: "120%", color: "#1C1C1D", textAlign: "center" }}>
                                {start.getDate()}
                              </span>
                              <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 10, lineHeight: "120%", color: "#78788D", textAlign: "center" }}>
                                {start.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}
                              </span>
                            </div>
                            <div className="flex flex-col items-start flex-shrink-0" style={{ width: 240, gap: 8 }}>
                              <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 16, lineHeight: "120%", color: "#1C1C1D" }} className="truncate">
                                {meeting.title || "Untitled Meeting"}
                              </span>
                              <div className="flex flex-row items-center flex-shrink-0" style={{ gap: 8 }}>
                                <AlarmClock size={14} style={{ color: "#78788D" }} />
                                <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 10, lineHeight: "120%", color: "#78788D" }}>
                                  {start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} - {end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} ({duration} mins)
                                </span>
                              </div>
                              {(() => {
                                const attendees = [...(meeting.internalParticipants || []), ...(meeting.participants || [])];
                                const visibleAttendees = attendees.slice(0, 3);
                                const extraAttendees = attendees.length - visibleAttendees.length;
                                if (attendees.length === 0) return null;
                                return (
                                  <div className="flex flex-row items-center flex-shrink-0" style={{ gap: 12 }}>
                                    <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 10, lineHeight: "120%", color: "#78788D" }}>
                                      Attendees
                                    </span>
                                    <div className="flex flex-row items-center flex-shrink-0">
                                      {visibleAttendees.map((att, i) => (
                                        <div
                                          key={att._id || i}
                                          className="flex items-center justify-center flex-shrink-0"
                                          style={{
                                            width: 20,
                                            height: 20,
                                            borderRadius: "50%",
                                            background: "#D9D9D9",
                                            border: "1px solid #FFFFFF",
                                            marginLeft: i === 0 ? 0 : -4,
                                          }}
                                        >
                                          <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 10, color: "#78788D" }}>
                                            {(att.name || "?").charAt(0).toUpperCase()}
                                          </span>
                                        </div>
                                      ))}
                                      {extraAttendees > 0 && (
                                        <div
                                          className="flex items-center justify-center flex-shrink-0"
                                          style={{
                                            height: 20,
                                            padding: "0 6px",
                                            borderRadius: 10,
                                            background: "#D9D9D9",
                                            border: "1px solid #FFFFFF",
                                            marginLeft: -4,
                                          }}
                                        >
                                          <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 10, color: "#78788D", whiteSpace: "nowrap" }}>
                                            +{extraAttendees} more
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                            <div className="flex flex-col items-start flex-shrink-0" style={{ gap: 4 }}>
                              <span
                                className="inline-flex items-center justify-center flex-shrink-0"
                                style={{
                                  padding: "5px 12px",
                                  borderRadius: 53,
                                  background: "rgba(52, 199, 89, 0.1)",
                                  fontFamily: "Inter",
                                  fontWeight: 500,
                                  fontSize: 12,
                                  lineHeight: "120%",
                                  color: "#34C759",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                Completed
                              </span>
                              <div className="flex flex-row items-center flex-shrink-0" style={{ gap: 8 }}>
                                <span
                                  className="flex items-center justify-center flex-shrink-0"
                                  style={{ width: 16, height: 16, background: "#E1E4EA", borderRadius: 103 }}
                                >
                                  <VideoIcon className="w-2.5 h-2.5" style={{ color: "#000000" }} />
                                </span>
                                <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 10, lineHeight: "120%", color: "#78788D" }} className="capitalize">
                                  {meeting.meetingType?.replace("-", " ") || "General"}
                                </span>
                              </div>
                              {meeting.company?.name && (
                                <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 10, lineHeight: "120%", color: "#78788D" }} className="truncate">
                                  Related to: {meeting.company.name}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-row items-center flex-shrink-0 flex-1 justify-end" style={{ gap: 8 }}>
                              <div
                                className="flex items-center justify-center flex-shrink-0"
                                style={{ width: 32, height: 32, borderRadius: "50%", background: "#D9D9D9", border: "1px solid #FFFFFF" }}
                              >
                                <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 12, color: "#78788D" }}>
                                  {(meeting.createdBy?.name || "?").charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div className="flex flex-col items-start" style={{ minWidth: 120 }}>
                                <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 12, lineHeight: "120%", color: "#1C1C1D" }} className="truncate">
                                  {meeting.createdBy?.name || "Unassigned"}
                                </span>
                                <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 10, lineHeight: "120%", color: "#78788D" }}>
                                  Organiser
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleMeetingClick(meeting); }}
                                className="flex items-center justify-center flex-shrink-0 hover:bg-gray-100 rounded-lg transition-colors"
                                style={{ marginLeft: 12, padding: 4 }}
                                title="View meeting"
                              >
                                <EyeIcon size={16} style={{ color: "#78788D" }} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            <div className="flex flex-row items-center self-stretch flex-shrink-0" style={{ padding: 0, gap: 12 }}>
              <span
                className="flex-shrink-0"
                style={{ width: 10, height: 10, borderRadius: 9999, background: "#0085FF" }}
              />
              <span
                onClick={() => setViewMode("list")}
                style={{
                  fontFamily: "Inter",
                  fontWeight: 600,
                  fontSize: 12,
                  lineHeight: "120%",
                  color: "#0085FF",
                  cursor: "pointer",
                }}
              >
                View All Completed Meetings
              </span>
            </div>
          </div>
        </div>
      )}

      {viewMode === "list" && listTotalCount > 0 && (
        <div
          ref={fillFooterRef}
          className="w-full bg-transparent px-4 py-3 mt-3 flex items-center justify-between sm:px-6"
        >
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => handleListPageChange(listPage - 1)}
              disabled={!hasListPrevPage}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => handleListPageChange(listPage + 1)}
              disabled={!hasListNextPage}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>

          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div className="flex items-center space-x-2">
              <p className="text-sm text-gray-700 font-inter">
                Showing <span className="font-semibold">{listStartItem}</span> to{" "}
                <span className="font-semibold">{listEndItem}</span> of{" "}
                <span className="font-semibold">{listTotalCount}</span> results
              </p>
              <select
                value={listLimit}
                onChange={(e) => handleListLimitChange(parseInt(e.target.value))}
                className="ml-2 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-inter"
              >
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>
            </div>

            <EditablePaginationButtons
              currentPage={listPage}
              totalPages={listTotalPages}
              hasPrevPage={hasListPrevPage}
              hasNextPage={hasListNextPage}
              onPageChange={handleListPageChange}
              getPageNumbers={getListPageNumbers}
            />
          </div>
        </div>
      )}



      {showMeetingForm && (
        <AdminMeetingForm
          open={showMeetingForm}
          mode={editingMeeting ? "view" : "create"}
          startInEditMode={!!editingMeeting}
          meetingData={editingMeeting}
          initialCompanyId={contactId || dealId ? null : companyId}
          companyName={companyName}
          initialContactId={contactId}
          contactName={contactName}
          initialDealId={dealId}
          dealName={dealName}
          users={staffUsers}
          companies={[{ _id: companyId, name: companyName }]}
          onSave={handleMeetingSave}
          onDelete={handleMeetingDelete}
          onClose={closeMeetingForm}
        />
      )}

      <MeetingDetailsModal
        open={isDetailsOpen}
        meetingData={selectedMeeting}
        users={users}
        staffUsers={staffUsers}
        onDelete={handleMeetingDelete}
        onEdit={handleEditMeeting}
        onComplete={handleMeetingComplete}
        onClose={() => setIsDetailsOpen(false)}
      />

      {meetingToDelete && (
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
                Delete meeting "{meetingToDelete.title || "Meeting"}"? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setMeetingToDelete(null)}
                  disabled={deletingMeeting}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteMeetingConfirmed}
                  disabled={deletingMeeting}
                  className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  {deletingMeeting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
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
                Delete {selectedItems.length} selected meeting{selectedItems.length !== 1 ? 's' : ''}? This action cannot be undone.
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
              <h3 className="text-lg font-bold text-gray-900 mb-4">Update Status for {selectedItems.length} Meetings</h3>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Select New Status</label>
                <select
                  value={bulkStatusValue}
                  onChange={(e) => setBulkStatusValue(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="" disabled>Select a status...</option>
                  {Object.entries(MEETING_STATUS_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
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
