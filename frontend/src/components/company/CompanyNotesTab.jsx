import DeleteIcon from "../common/DeleteIcon";
import EmptyState from "../common/EmptyState";
import Checkbox from "../common/Checkbox";
import PlusIcon from "../common/PlusIcon";
import MoreIcon from "../common/MoreIcon";
import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { getAncestorZoom } from "../../utils/domUtils";
import { getPinnedBoundaryOverlayStyle } from "../../utils/pinnedColumnShadow";
import { useParams } from "react-router-dom";
import {
  Filter,
  StickyNote,
  Tag,
  Link2,
  Users,
  Clock,
  Pin,
  PinOff,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  EyeOff,
  X,
  Copy, ArrowUp, ArrowDown } from "lucide-react";
import { EditablePaginationButtons } from "../common/EditablePaginationButtons";
import toast from "react-hot-toast";
import API from "../../services/api";
import { NoteEditor, NoteViewer, NoteCard } from "./NoteSection";
import FilterIcon from "../common/FilterIcon";
import HighlightText from "../common/HighlightText";

import TableSkeletonRows from "../common/TableSkeletonRows";
import NoteCardSkeleton from "../common/NoteCardSkeleton";
import StatTile from "../common/StatTile";
import StatTileSkeleton from "../common/StatTileSkeleton";
import Skeleton from "../common/Skeleton";
import BulkActionBar from "../common/BulkActionBar";
import { useBulkSelection, useBulkStrip } from "../../hooks/useBulkSelection";
import { exportToCSV } from "../../utils/exportToCSV";
import ToolbarFilterGroup from "./ToolbarFilterGroup";
import { bulkDelete } from "../../utils/bulkOperations";
import useFillToBottom from "../../hooks/useFillToBottom";
import { applyColumnFilters } from "../../utils/advancedFilters";

import SearchIcon from "../common/SearchIcon";
import { useSystemSettings } from "../../hooks/useSystemSettings";
import EyeIcon from "../common/EyeIcon";
import EditIcon from "../common/EditIcon";
const NOTE_VISIBILITY_OPTIONS = ["Team", "Private"];

const GridViewIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M7.011 7.01029V18.0103H14.011V15.0103C14.011 14.727 14.1068 14.4895 14.2985 14.2978C14.4902 14.1061 14.7277 14.0103 15.011 14.0103H18.011V7.01029H7.011ZM5.011 18.0103V6.98529C5.011 6.43529 5.211 5.96863 5.611 5.58529C6.011 5.20196 6.486 5.01029 7.036 5.01029H18.011C18.561 5.01029 19.0318 5.20613 19.4235 5.59779C19.8152 5.98946 20.011 6.46029 20.011 7.01029V14.1853C20.011 14.452 19.961 14.7061 19.861 14.9478C19.761 15.1895 19.6193 15.402 19.436 15.5853L15.586 19.4353C15.4027 19.6186 15.1902 19.7603 14.9485 19.8603C14.7068 19.9603 14.4527 20.0103 14.186 20.0103H7.011C6.461 20.0103 5.99017 19.8145 5.5985 19.4228C5.20683 19.0311 5.011 18.5603 5.011 18.0103ZM0.036 4.26029C-0.064 3.71029 0.0443333 3.21446 0.361 2.77279C0.677667 2.33113 1.111 2.06029 1.661 1.96029L12.511 0.0352941C13.0443 -0.0647059 13.5277 0.0477941 13.961 0.372794C14.3943 0.697794 14.6777 1.12696 14.811 1.66029L14.986 2.43529C15.0693 2.76863 15.0193 3.03529 14.836 3.23529C14.6527 3.43529 14.436 3.55196 14.186 3.58529C13.936 3.61863 13.6985 3.57279 13.4735 3.44779C13.2485 3.32279 13.0943 3.09363 13.011 2.76029L12.836 2.01029L2.011 3.93529L3.511 12.5353C3.561 12.8186 3.511 13.0728 3.361 13.2978C3.211 13.5228 2.99433 13.6603 2.711 13.7103C2.42767 13.7603 2.17767 13.7061 1.961 13.5478C1.74433 13.3895 1.611 13.1686 1.561 12.8853L0.036 4.26029Z" fill="currentColor" />
  </svg>
);

const ListViewIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size * (18 / 21)} viewBox="0 0 21 18" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M6.13333 13.1C5.58333 13.1 5.1125 12.9042 4.72083 12.5125C4.32917 12.1208 4.13333 11.65 4.13333 11.1V2C4.13333 1.45 4.32917 0.979167 4.72083 0.5875C5.1125 0.195833 5.58333 0 6.13333 0H18.1333C18.6833 0 19.1542 0.195833 19.5458 0.5875C19.9375 0.979167 20.1333 1.45 20.1333 2V11.1C20.1333 11.65 19.9375 12.1208 19.5458 12.5125C19.1542 12.9042 18.6833 13.1 18.1333 13.1H6.13333ZM6.13333 11.1H18.1333V2H6.13333V11.1ZM15.1333 6C15.4167 6 15.6542 5.90417 15.8458 5.7125C16.0375 5.52083 16.1333 5.28333 16.1333 5C16.1333 4.71667 16.0375 4.47917 15.8458 4.2875C15.6542 4.09583 15.4167 4 15.1333 4H9.10833C8.825 4 8.59167 4.09583 8.40833 4.2875C8.225 4.47917 8.13333 4.71667 8.13333 5C8.13333 5.28333 8.22917 5.52083 8.42083 5.7125C8.6125 5.90417 8.85 6 9.13333 6H15.1333ZM12.1333 9C12.4167 9 12.6542 8.90417 12.8458 8.7125C13.0375 8.52083 13.1333 8.28333 13.1333 8C13.1333 7.71667 13.0375 7.47917 12.8458 7.2875C12.6542 7.09583 12.4167 7 12.1333 7H9.10833C8.825 7 8.59167 7.09583 8.40833 7.2875C8.225 7.47917 8.13333 7.71667 8.13333 8C8.13333 8.28333 8.22917 8.52083 8.42083 8.7125C8.6125 8.90417 8.85 9 9.13333 9H12.1333ZM3.58333 17.975C3.03333 18.0583 2.54167 17.9333 2.10833 17.6C1.675 17.2667 1.41667 16.825 1.33333 16.275L0.00833333 6.375C-0.025 6.09167 0.0416667 5.84167 0.208333 5.625C0.375 5.40833 0.6 5.28333 0.883333 5.25C1.15 5.21667 1.39167 5.27917 1.60833 5.4375C1.825 5.59583 1.95 5.81667 1.98333 6.1L3.38333 16L10.2333 15.05L14.3333 14.475C14.6333 14.425 14.9 14.5 15.1333 14.7C15.3667 14.9 15.4833 15.1583 15.4833 15.475C15.4833 15.725 15.4 15.9458 15.2333 16.1375C15.0667 16.3292 14.8583 16.4417 14.6083 16.475L3.58333 17.975Z" fill="currentColor" />
  </svg>
);

const TotalNotesIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="24 24 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M39.1202 39.0433C38.6042 38.5273 38.3462 37.9007 38.3462 37.1635C38.3462 36.4263 38.6042 35.7998 39.1202 35.2838C39.6362 34.7678 40.2628 34.5098 41 34.5098C41.7372 34.5098 42.3638 34.7678 42.8798 35.2838C43.3958 35.7998 43.6538 36.4263 43.6538 37.1635C43.6538 37.9007 43.3958 38.5273 42.8798 39.0433C42.3638 39.5592 41.7372 39.8173 41 39.8173C40.2628 39.8173 39.6362 39.5592 39.1202 39.0433ZM41.8182 37.9817C42.0419 37.7581 42.1538 37.4853 42.1538 37.1635C42.1538 36.8417 42.0419 36.5689 41.8182 36.3453C41.5946 36.1214 41.3218 36.0095 41 36.0095C40.6782 36.0095 40.4054 36.1214 40.1818 36.3453C39.9581 36.5689 39.8462 36.8417 39.8462 37.1635C39.8462 37.4853 39.9581 37.7581 40.1818 37.9817C40.4054 38.2054 40.6782 38.3173 41 38.3173C41.3218 38.3173 41.5946 38.2054 41.8182 37.9817ZM35.3463 46.2693V43.7153C35.3463 43.4257 35.4153 43.1535 35.5533 42.8985C35.6912 42.6435 35.8844 42.4402 36.1328 42.2885C36.6309 41.9913 37.1563 41.745 37.709 41.5495C38.2617 41.354 38.826 41.2093 39.402 41.1155L41 43.125L42.5885 41.1155C43.1677 41.2093 43.7312 41.354 44.279 41.5495C44.8267 41.745 45.351 41.9913 45.852 42.2885C46.1007 42.4397 46.2948 42.6423 46.4345 42.8962C46.5743 43.1501 46.6474 43.4199 46.6538 43.7057V46.2693H35.3463ZM36.8212 44.7693H40.3865L38.8348 42.7923C38.4814 42.8818 38.1379 42.998 37.8042 43.141C37.4706 43.2842 37.1429 43.4436 36.8212 43.6193V44.7693ZM41.6135 44.7693H45.1538V43.6193C44.8423 43.4333 44.5197 43.273 44.186 43.1385C43.8525 43.0038 43.5091 42.8917 43.1557 42.802L41.6135 44.7693ZM29.3123 44.5C28.8106 44.5 28.3831 44.323 28.0298 43.969C27.6766 43.615 27.5 43.1894 27.5 42.6923V29.3077C27.5 28.8106 27.677 28.385 28.031 28.031C28.385 27.677 28.8106 27.5 29.3077 27.5H42.6923C43.1894 27.5 43.615 27.677 43.969 28.031C44.323 28.385 44.5 28.8106 44.5 29.3077V33.6538C44.291 33.4166 44.0683 33.1945 43.8318 32.9875C43.5953 32.7805 43.318 32.6366 43 32.5557V29.3077C43 29.2179 42.9712 29.1442 42.9135 29.0865C42.8558 29.0288 42.7821 29 42.6923 29H29.3077C29.2179 29 29.1442 29.0288 29.0865 29.0865C29.0288 29.1442 29 29.2179 29 29.3077V42.6923C29 42.7821 29.0288 42.8558 29.0865 42.9135C29.1442 42.9712 29.2179 43 29.3077 43H33.0538C33.0231 43.1192 33 43.2384 32.9845 43.3577C32.9692 43.4769 32.9615 43.5961 32.9615 43.7153V44.5H29.3123ZM31.25 32.8652H38.4615C38.7987 32.6281 39.1631 32.4518 39.5548 32.3365C39.9464 32.2212 40.3448 32.1571 40.75 32.1443V31.3655H31.25V32.8652ZM31.25 36.75H36.0095C36.0223 36.4833 36.0583 36.2266 36.1173 35.9798C36.1763 35.7331 36.2532 35.4898 36.348 35.25H31.25V36.75ZM31.25 40.6345H34.373C34.55 40.491 34.7362 40.3593 34.9317 40.2395C35.1272 40.1195 35.3269 40.0127 35.5308 39.9192V39.1348H31.25V40.6345ZM29 43V29V32.5405V32.125V43Z" fill="currentColor" />
  </svg>
);

const RecentNotesIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="363.5 25.75 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M366.808 43H380.192C380.282 43 380.356 42.9712 380.413 42.9135C380.471 42.8558 380.5 42.7821 380.5 42.6923V33.7193L375.781 29H366.808C366.718 29 366.644 29.0288 366.587 29.0865C366.529 29.1442 366.5 29.2179 366.5 29.3077V42.6923C366.5 42.7821 366.529 42.8558 366.587 42.9135C366.644 42.9712 366.718 43 366.808 43ZM366.808 44.5C366.309 44.5 365.883 44.3234 365.53 43.9703C365.177 43.6169 365 43.1909 365 42.6923V29.3077C365 28.8091 365.177 28.3831 365.53 28.0298C365.883 27.6766 366.309 27.5 366.808 27.5H376.394L382 33.1057V42.6923C382 43.1909 381.823 43.6169 381.47 43.9703C381.117 44.3234 380.691 44.5 380.192 44.5H366.808ZM368.75 40.5H378.25V39H368.75V40.5ZM368.75 36.75H378.25V35.25H368.75V36.75ZM368.75 33H375.115V31.5H368.75V33Z" fill="currentColor" />
  </svg>
);

const TeamContributorsIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="24 24 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M25.5098 43.6924V39.9424C25.5098 39.459 25.6735 39.0498 26.001 38.7146C26.3285 38.3793 26.7256 38.2052 27.1923 38.1924H30.275C30.5763 38.1924 30.8626 38.2661 31.1338 38.4136C31.4048 38.5611 31.6256 38.7669 31.7963 39.0309C32.2923 39.7129 32.9073 40.2436 33.6413 40.6231C34.3753 41.0026 35.1615 41.1924 36 41.1924C36.8487 41.1924 37.6416 41.0026 38.3788 40.6231C39.1161 40.2436 39.7277 39.7129 40.2135 39.0309C40.4045 38.7669 40.633 38.5611 40.899 38.4136C41.165 38.2661 41.4403 38.1924 41.725 38.1924H44.8078C45.2846 38.2052 45.6859 38.3793 46.0115 38.7146C46.3372 39.0498 46.5 39.459 46.5 39.9424V43.6924H40V41.3404C39.4295 41.7764 38.8052 42.1107 38.127 42.3434C37.4487 42.576 36.7397 42.6924 36 42.6924C35.277 42.6924 34.5754 42.575 33.8953 42.3404C33.2151 42.1059 32.5865 41.7706 32.0095 41.3346V43.6924H25.5098ZM36 39.8079C35.3987 39.8079 34.8291 39.6684 34.2913 39.3896C33.7536 39.1108 33.3027 38.7258 32.9385 38.2346C32.6808 37.8629 32.3668 37.5594 31.9963 37.3241C31.6258 37.0889 31.2225 36.9457 30.7865 36.8944C31.2108 36.3739 31.9522 35.9697 33.0105 35.6819C34.0688 35.394 35.0653 35.2501 36 35.2501C36.9347 35.2501 37.9312 35.394 38.9895 35.6819C40.0478 35.9697 40.7923 36.3739 41.223 36.8944C40.7973 36.9457 40.3968 37.0889 40.0213 37.3241C39.6456 37.5594 39.3289 37.8629 39.0713 38.2346C38.7238 38.7424 38.2795 39.1316 37.7385 39.4021C37.1975 39.6726 36.618 39.8079 36 39.8079ZM28.2885 36.8079C27.5322 36.8079 26.8848 36.5386 26.3463 36.0001C25.8078 35.4616 25.5385 34.8142 25.5385 34.0579C25.5385 33.2847 25.8078 32.6331 26.3463 32.1031C26.8848 31.5729 27.5322 31.3079 28.2885 31.3079C29.0615 31.3079 29.7131 31.5729 30.2433 32.1031C30.7734 32.6331 31.0385 33.2847 31.0385 34.0579C31.0385 34.8142 30.7734 35.4616 30.2433 36.0001C29.7131 36.5386 29.0615 36.8079 28.2885 36.8079ZM43.7115 36.8079C42.9552 36.8079 42.3078 36.5386 41.7693 36.0001C41.2308 35.4616 40.9615 34.8142 40.9615 34.0579C40.9615 33.2847 41.2308 32.6331 41.7693 32.1031C42.3078 31.5729 42.9552 31.3079 43.7115 31.3079C44.4845 31.3079 45.1361 31.5729 45.6663 32.1031C46.1964 32.6331 46.4615 33.2847 46.4615 34.0579C46.4615 34.8142 46.1964 35.4616 45.6663 36.0001C45.1361 36.5386 44.4845 36.8079 43.7115 36.8079ZM36 33.8079C35.2437 33.8079 34.5963 33.5386 34.0578 33.0001C33.5193 32.4616 33.25 31.8142 33.25 31.0579C33.25 30.2847 33.5193 29.6331 34.0578 29.1031C34.5963 28.5729 35.2437 28.3079 36 28.3079C36.773 28.3079 37.4246 28.5729 37.9548 29.1031C38.4849 29.6331 38.75 30.2847 38.75 31.0579C38.75 31.8142 38.4849 32.4616 37.9548 33.0001C37.4246 33.5386 36.773 33.8079 36 33.8079Z" fill="currentColor" />
  </svg>
);

const LastUpdatedIcon = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="363.48 26 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M373.51 44.5C372.33 44.5 371.225 44.2769 370.194 43.8307C369.163 43.3846 368.265 42.7782 367.498 42.0115C366.731 41.2448 366.125 40.3461 365.679 39.3152C365.233 38.2846 365.01 37.1795 365.01 36C365.01 34.8205 365.233 33.7154 365.679 32.6848C366.125 31.6539 366.731 30.7552 367.498 29.9885C368.265 29.2218 369.163 28.6154 370.194 28.1693C371.225 27.7231 372.33 27.5 373.51 27.5C374.767 27.5 375.962 27.7644 377.094 28.2932C378.226 28.8221 379.198 29.5653 380.01 30.523V28.1538H381.51V33.2307H376.433V31.7307H379.048C378.358 30.8807 377.536 30.2132 376.581 29.728C375.626 29.2427 374.602 29 373.51 29C371.56 29 369.905 29.6792 368.547 31.0375C367.189 32.3958 366.51 34.05 366.51 36C366.51 37.95 367.189 39.6042 368.547 40.9625C369.905 42.3208 371.56 43 373.51 43C375.26 43 376.786 42.4318 378.088 41.2952C379.39 40.1587 380.167 38.727 380.419 37H381.95C381.706 39.1487 380.78 40.9358 379.171 42.3615C377.562 43.7872 375.675 44.5 373.51 44.5ZM376.483 40.027L372.76 36.3038V31H374.26V35.6962L377.537 38.973L376.483 40.027Z" fill="currentColor" />
  </svg>
);

// Also drives the contact profile's Notes tab: pass `contactId` (plus that
// contact's `companyId`, since a Note always belongs to a company in the data
// model) and it scopes itself to notes tagged with that contact. Same table,
// editor, filters and bulk strip either way.
export default function CompanyNotesTab({ showStats = true, autoOpenCreate = false, onAutoOpenCreateConsumed, contactId, dealId, companyId: scopedCompanyId }) {
  const { id: routeId } = useParams();
  // The company a new note is filed under: the scoped record's company on the
  // contact/deal pages, otherwise the company whose page we're on.
  const id = contactId || dealId ? scopedCompanyId : routeId;

  // Notes fetch their own data on mount, so the loading flag is local — the
  // parent's showRecordsSkeleton tracks a different request and would only
  // hold this skeleton up for longer than its own data actually takes.
  // NOTE: the existing `loading` state below belongs to the save/submit path;
  // this is deliberately separate.
  const [isNotesLoading, setIsNotesLoading] = useState(true);
  // Only surface the skeleton if the fetch is actually slow. Switching tabs
  // remounts this component, so a fast request made the skeleton flash for a
  // frame or two on every visit — more distracting than the wait it was
  // covering, and it read as a loader appearing out of nowhere.
  const [skeletonDelayPassed, setSkeletonDelayPassed] = useState(false);
  useEffect(() => {
    if (!isNotesLoading) {
      setSkeletonDelayPassed(false);
      return;
    }
    const t = setTimeout(() => setSkeletonDelayPassed(true), 250);
    return () => clearTimeout(t);
  }, [isNotesLoading]);
  const showNotesSkeleton = isNotesLoading && skeletonDelayPassed;

  // Keeps the list-view table box a fixed height ending at the bottom of the
  // screen, so changing rows-per-page scrolls internally.
  const {
    containerRef: fillContainerRef,
    footerRef: fillFooterRef,
    style: fillStyle,
  } = useFillToBottom();

  const [notes, setNotes] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [taggedContacts, setTaggedContacts] = useState([]);
  const [noteType, setNoteType] = useState("General Note");
  const [visibility, setVisibility] = useState("Team");
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [viewingNote, setViewingNote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [manualEditorOpen, setManualEditorOpen] = useState(false);
  
  const { noteTypes } = useSystemSettings();
  
  const NOTE_FILTER_COLUMNS = useMemo(() => [
    { key: "type", label: "Type", options: noteTypes },
    { key: "year", label: "Visibility To", placeholder: "All Visibility", options: NOTE_VISIBILITY_OPTIONS },
    { key: "contacts", label: "Author" },
  ], [noteTypes]);

  // Derived rather than copied into local state on a one-shot effect — a
  // copy raced the initial notes/contacts fetch (whichever re-rendered
  // first won) and could get clobbered before ever becoming visible.
  // Staying derived means it's simply true for as long as the parent's
  // trigger is, regardless of what else re-renders in between. Not gated
  // on the fetch finishing either — that gate itself could stall
  // indefinitely under request contention from whichever tab you came
  // from, silently blocking the open. The new-note form doesn't need
  // notes/contacts loaded to render; contacts just populates the tagging
  // dropdown a moment later once its own fetch resolves.
  const isEditorOpen = manualEditorOpen || autoOpenCreate;
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewMode, setViewMode] = useState("grid");
  const [hiddenColumns, setHiddenColumns] = useState(new Set());
  const [leftPinned, setLeftPinned] = useState(new Set());
  const [rightPinned, setRightPinned] = useState(new Set());
  const [openColumnMenuKey, setOpenColumnMenuKey] = useState(null);
  const [columnMenuPos, setColumnMenuPos] = useState(null);
  const columnMenuRef = useRef(null);

  const BASE_COLUMNS = useMemo(() => [
    { id: "title", label: "Task Title", width: 212, pinnable: true },
    { id: "type", label: "Type", width: 160, pinnable: true },
    { id: "description", label: "Linked To", width: 227, pinnable: true },
    { id: "contacts", label: "Author", width: 144, pinnable: true },
    { id: "company", label: "Tags", width: 205, pinnable: true },
    { id: "date", label: "Last Updated", width: 117, pinnable: true },
    { id: "year", label: "Visibility To", width: 93, pinnable: true },
  ], []);

  const [columnOrder, setColumnOrder] = useState(() => BASE_COLUMNS.map(c => c.id));
  const [draggedColKey, setDraggedColKey] = useState(null);
  const [dragOverColKey, setDragOverColKey] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  const dragOverRef = useRef(null);
  const ghostElRef = useRef(null);
  const [openRowActionsId, setOpenRowActionsId] = useState(null);
  const [rowActionsPos, setRowActionsPos] = useState(null);
  const rowActionsRef = useRef(null);
  const [noteToDelete, setNoteToDelete] = useState(null);
  const [deletingNote, setDeletingNote] = useState(false);

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
    let positionGhost = () => {};

    const beginDrag = () => {
      dragStarted = true;
      e.preventDefault();
      window.getSelection?.()?.removeAllRanges();
      const rect = th.getBoundingClientRect();
      const label = BASE_COLUMNS.find((vc) => vc.id === colId)?.label || colId;
    
      const previewRows = (notes || []).slice(0, 10).map((n) => {
        let val = n[colId];
        if (colId === 'contacts') val = n.author?.name || "—";
        if (colId === 'company') val = (n.tags || []).join(", ") || "—";
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
    description: 227,
    contacts: 144,
    company: 205,
    date: 117,
    year: 93,
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

  const fetchNotes = useCallback(async () => {
    try {
      const res = await API.get(
        contactId
          ? `/notes/contact/${contactId}`
          : dealId
            ? `/notes/deal/${dealId}`
            : `/notes/company/${id}`,
      );
      const sorted = res.data.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      );
      setNotes(sorted);
    } catch (err) {
      toast.error("Failed to load notes");
    } finally {
      // In `finally` so a failed request drops the skeleton too, rather than
      // leaving it pulsing forever behind the error toast.
      setIsNotesLoading(false);
    }
  }, [id, contactId, dealId]);

  const fetchContacts = useCallback(async () => {
    try {
      const res = await API.get("/contacts");
      setContacts(res.data.filter((c) => c.company?._id === id));
    } catch (err) {
      toast.error("Failed to load contacts");
    }
  }, [id]);

  useEffect(() => {
    fetchNotes();
    fetchContacts();
  }, [fetchNotes, fetchContacts]);

  const withContactTagged = (ids) =>
    contactId && !ids.includes(contactId) ? [...ids, contactId] : ids;

  const resetForm = () => {
    setEditingNoteId(null);
    setNoteTitle("");
    setNoteContent("");
    setTaggedContacts([]);
    setNoteType(noteTypes[0] || "General Note");
    setVisibility("Team");
    setManualEditorOpen(false);
    // Clears the parent's auto-open trigger too, so it doesn't reopen the
    // editor if the user switches away from and back to this tab.
    if (autoOpenCreate) onAutoOpenCreateConsumed?.();
  };

  const handleAddOrUpdateNote = async () => {
    // Guarded here as well as by the editor's disabled Save button — this is
    // also reachable from the editor's Enter-to-submit path.
    if (!noteTitle.trim()) {
      toast.error("Note title is required");
      return;
    }
    if (!noteContent.trim() || noteContent === "<p><br></p>") {
      toast.error("Note content is required");
      return;
    }
    try {
      setLoading(true);
      if (editingNoteId) {
        await API.put(`/notes/${editingNoteId}`, {
          title: noteTitle,
          note: noteContent,
          taggedContacts: withContactTagged(taggedContacts.map((c) => c.value)),
          noteType,
          visibility,
        });
        toast.success("Note updated");
      } else {
        await API.post("/notes", {
          title: noteTitle,
          note: noteContent,
          company: id,
          // The deal-scoped fetch matches on Note.deal, so a note created from
          // a deal's tab has to record it or it vanishes on save.
          ...(dealId ? { deal: dealId } : {}),
          // On the contact page the contact must stay tagged: the
          // contact-scoped fetch matches on taggedContacts, so an untagged
          // note would vanish the moment it was saved.
          taggedContacts: withContactTagged(taggedContacts.map((c) => c.value)),
          noteType,
          visibility,
        });
        toast.success("Note created");
      }
      resetForm();
      fetchNotes();
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to save note");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (note) => {
    setEditingNoteId(note._id);
    setNoteTitle(note.title || "");
    setNoteContent(note.note);
    setTaggedContacts(
      note.taggedContacts.map((c) => ({ label: c.name, value: c._id })),
    );
    setNoteType(note.noteType || noteTypes[0] || "General Note");
    setVisibility(note.visibility || "Team");
    setManualEditorOpen(true);
  };

  const handleView = (note) => {
    setViewingNote(note);
    setIsViewerOpen(true);
  };

  const handleDelete = async (noteId) => {
    if (!window.confirm("Delete this note?")) return;
    try {
      await API.delete(`/notes/${noteId}`);
      fetchNotes();
      toast.success("Note deleted");
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to delete note");
      }
    }
  };

  const handleDuplicate = async (note) => {
    try {
      await API.post("/notes", {
        title: note.title ? `${note.title} (Copy)` : "",
        note: note.note,
        company: id,
        ...(dealId ? { deal: dealId } : {}),
        taggedContacts: withContactTagged(
          (note.taggedContacts || []).map((c) => c._id || c),
        ),
        noteType: note.noteType || noteTypes[0] || "General Note",
        visibility: note.visibility || "Team",
      });
      toast.success("Note duplicated");
      fetchNotes();
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to duplicate note");
      }
    }
  };

  const handleDeleteNoteConfirmed = async () => {
    if (!noteToDelete) return;
    setDeletingNote(true);
    try {
      await API.delete(`/notes/${noteToDelete._id}`);
      await fetchNotes();
      toast.success("Note deleted");
      setNoteToDelete(null);
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to delete note");
      }
    } finally {
      setDeletingNote(false);
    }
  };

  const closeViewer = () => {
    setViewingNote(null);
    setIsViewerOpen(false);
  };

  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return { key: null, direction: null };
    });
  };
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState({});

  const getNoteFieldValue = (note, key) => {
    switch (key) {
      case "title":
        return note.title || "Untitled Note";
      case "type":
        return note.noteType || "General Note";
      case "description":
        return note.company?.name || "";
      case "contacts":
        return typeof note.user === "object" ? note.user?.name || "Unknown" : "Unknown";
      case "company":
        return note.taggedContacts?.map((c) => c.name).join(", ") || "";
      case "date":
        return note.createdAt ? new Date(note.createdAt).getTime() : 0;
      case "year":
        return note.visibility || "Team";
      default:
        return note[key];
    }
  };

  const filteredNotes = useMemo(() => {
    let result = notes;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter((note) => {
        const content = note.note ? note.note.replace(/<[^>]*>/g, "").toLowerCase() : "";
        const taggedNames = note.taggedContacts ? note.taggedContacts.map((c) => (c.name || "").toLowerCase()).join(" ") : "";
        const descriptionStr = (note.company?.name || "").toLowerCase();
        const contactStr = typeof note.user === "object" ? (note.user?.name || "").toLowerCase() : "";

        return (
          (note.title || "").toLowerCase().includes(q) ||
          content.includes(q) ||
          taggedNames.includes(q) ||
          descriptionStr.includes(q) ||
          contactStr.includes(q)
        );
      });
    }
    return applyColumnFilters(result, selectedFilters, getNoteFieldValue);
  }, [notes, searchTerm, selectedFilters]);

  const sortedNotes = useMemo(() => {
    if (!sortConfig.key) return filteredNotes;
    return [...filteredNotes].sort((a, b) => {
      const aVal = getNoteFieldValue(a, sortConfig.key);
      const bVal = getNoteFieldValue(b, sortConfig.key);
      const aCmp = typeof aVal === "number" ? aVal : (aVal || "").toString().toLowerCase();
      const bCmp = typeof bVal === "number" ? bVal : (bVal || "").toString().toLowerCase();
      if (aCmp < bCmp) return sortConfig.direction === "asc" ? -1 : 1;
      if (aCmp > bCmp) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredNotes, sortConfig]);

  const { selectedItems, toggleItem, clearSelection, selectAll } = useBulkSelection({
    items: filteredNotes,
    onDelete: () => setShowBulkDeleteModal(true)
  });

  // Keeps the bulk strip mounted for one beat after deselect so its
  // slide-out animation can play instead of vanishing on the same frame.
  const { visible: bulkStripVisible, closing: bulkStripClosing } =
    useBulkStrip(selectedItems.length);

  const [listPage, setListPage] = useState(1);
  const [listLimit, setListLimit] = useState(10);

  const listTotalCount = sortedNotes.length;
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
    const dataToExport = notes.filter(n => selectedItems.includes(n._id)).map(n => ({
      "Title": n.title || "Untitled Note",
      "Type": "General Note",
      "Author": typeof n.user === "object" ? n.user?.name || "Unknown" : "Unknown",
      "Created At": n.createdAt ? new Date(n.createdAt).toLocaleString() : "",
    }));
    const headers = Object.keys(dataToExport[0] || {}).join(",");
    const rows = dataToExport.map(row => Object.values(row).map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    exportToCSV([headers, ...rows], `notes_export_${new Date().toISOString().split("T")[0]}.csv`);
  };

  const handleBulkDelete = async () => {
    setBulkActionLoading(true);
    try {
      await bulkDelete("notes", selectedItems);
      setNotes?.(prev => prev.filter(n => !selectedItems.includes(n._id)));
      toast.success(`${selectedItems.length} note(s) deleted`);
      clearSelection();
      setShowBulkDeleteModal(false);
    } catch (error) {
      console.error("Bulk delete failed:", error);
      toast.error("Failed to delete notes");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleSelectAllAcrossPages = () => selectAll(filteredNotes);

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

  const paginatedNotes = useMemo(
    () => sortedNotes.slice((listPage - 1) * listLimit, listPage * listLimit),
    [sortedNotes, listPage, listLimit],
  );

  const getNotePreviewText = (html) => {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html || "";
    const text = tempDiv.textContent || tempDiv.innerText || "";
    return text.length > 60 ? text.substring(0, 60) + "..." : text;
  };

  const formatNoteDate = (dateString) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString([], {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatNoteTime = (dateString) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // KPI stats
  const sorted = [...notes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const latest = sorted[0];
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentCount = notes.filter((n) => new Date(n.createdAt) >= sevenDaysAgo).length;
  const contributors = new Set(
    notes.map((n) => (typeof n.user === "object" ? n.user?._id : n.user)),
  );
  contributors.delete(undefined);
  contributors.delete(null);

  const relativeDays = (date) => {
    if (!date) return "—";
    const diff = Math.floor((Date.now() - new Date(date)) / (1000 * 60 * 60 * 24));
    if (diff <= 0) return "today";
    if (diff === 1) return "1 day ago";
    return `${diff} days ago`;
  };

  const latestUpdatedLabel = (() => {
    if (!latest) return "—";
    const diff = Math.floor((Date.now() - new Date(latest.createdAt)) / (1000 * 60 * 60 * 24));
    return diff <= 0 ? "Today" : relativeDays(latest.createdAt);
  })();

  const latestSubtitle = latest
    ? `${typeof latest.user === "object" ? latest.user?.name || "Unknown" : "Unknown"} · ${new Date(
      latest.createdAt,
    ).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : null;

  const kpiTiles = [
    { label: "Total Notes", value: notes.length, icon: TotalNotesIcon },
    {
      label: "Recent Notes",
      value: recentCount,
      icon: RecentNotesIcon,
      subtitle: latest ? `Latest update ${relativeDays(latest.createdAt)}` : null,
      subtitleClass: "text-gray-400",
    },
    { label: "Team Contributors", value: contributors.size, icon: TeamContributorsIcon },
    {
      label: "Last Updated",
      value: latestUpdatedLabel,
      icon: LastUpdatedIcon,
      subtitle: latestSubtitle,
      subtitleClass: "text-gray-400",
    },
  ];

  return (
    <div>
      {/* KPI Tiles */}
      {showStats && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {showNotesSkeleton ? (
              Array.from({ length: 4 }).map((_, i) => <StatTileSkeleton key={i} />)
            ) : (
              kpiTiles.map((tile) => (
              <StatTile key={tile.label} tile={tile} />
            )))}
          </div>

          <div className="-mx-6" style={{ marginTop: 24, paddingBottom: 24, borderTop: "1px solid #E1E4EA" }} />
        </>
      )}

      {/* Search + Controls — skeletoned as one row so the whole area above the
          table resolves at the same moment, matching Contacts/Invoices. */}
      {showNotesSkeleton ? (
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
          entityName="note"
          onSelectAll={handleSelectAllAcrossPages}
          onDeselectAll={clearSelection}
          onExport={handleExportSelected}
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
            placeholder="Search by note by name, deal..."
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
        <div className="relative flex items-center gap-1.5 p-1 bg-[#F1F1F5] rounded-full flex-shrink-0 overflow-hidden" style={{ height: "44px" }}>
          <span
            className="absolute top-1 w-9 h-9 rounded-full bg-white shadow-[0px_4px_4px_rgba(0,0,0,0.1)] transition-all duration-300 ease-out pointer-events-none"
            style={{ left: viewMode === "list" ? 46 : 4 }}
          />
          <button
            onClick={() => setViewMode("grid")}
            title="Grid view"
            className={`relative z-10 w-9 h-9 flex items-center justify-center rounded-full transition-colors ${
              viewMode === "grid"
                ? "text-[#0085FF]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <GridViewIcon size={18} />
          </button>
          <button
            onClick={() => setViewMode("list")}
            title="List view"
            className={`relative z-10 w-9 h-9 flex items-center justify-center rounded-full transition-colors ${
              viewMode === "list"
                ? "text-[#0085FF]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <ListViewIcon size={18} />
          </button>
        </div>
        <ToolbarFilterGroup
          isOpen={showFilterPanel}
          columns={NOTE_FILTER_COLUMNS}
          data={notes}
          getFieldValue={getNoteFieldValue}
          selected={selectedFilters}
          onApply={setSelectedFilters}
        />
        <button
          onClick={() => setShowFilterPanel((open) => !open)}
          aria-expanded={showFilterPanel}
          className={`relative flex items-center justify-center gap-2 px-3 text-sm font-medium bg-white border rounded-full hover:bg-gray-50 flex-shrink-0 transition-colors ${
            showFilterPanel ? "text-[#0085FF]" : "text-gray-800"
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
        <button
          onClick={() => setManualEditorOpen(true)}
          className="flex items-center justify-center rounded-full border hover:bg-gray-50 flex-shrink-0"
          style={{ width: "44px", height: "44px", borderColor: "#E1E4EA" }}
          title="Add Note"
        >
          <PlusIcon className="w-4 h-4" />
        </button>
      </div>
      )}

      {/* Notes list, skeleton, or empty state.
          The skeleton branch has to come FIRST: during the initial fetch
          `filteredNotes` is still [], so otherwise the empty-state button renders
          and neither skeleton ever mounts. The skeleton matches the ACTIVE view —
          cards for Grid (the default), rows for List — so the real content
          replaces it in place instead of snapping to a different layout. */}
      {showNotesSkeleton ? (
        viewMode === "grid" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(311px, 1fr))",
              gap: 24,
            }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <NoteCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div
            className="box-border flex flex-col items-start w-full bg-white overflow-x-auto"
            style={{ border: "1px solid #E1E4EA", borderRadius: 8 }}
          >
            <table
              className="text-sm text-left border-collapse"
              style={{ tableLayout: "fixed", width: "100%", minWidth: totalTableWidth, maxWidth: "100%" }}
            >
              <tbody>
                <TableSkeletonRows
                  numRows={listLimit}
                  rowHeight={60}
                  hasCheckbox={false}
                  columns={orderedColumns.map((c) => colWidths[c.id])}
                />
              </tbody>
            </table>
          </div>
        )
      ) : notes.length === 0 ? (
        <div className="flex items-center justify-center w-full min-h-[300px] bg-white border border-[#E1E4EA] rounded-xl">
          <EmptyState icon={StickyNote} noun="Note" onCreate={() => setManualEditorOpen(true)} />
        </div>
      ) : viewMode === "grid" && filteredNotes.length === 0 ? (
        <div className="flex items-center justify-center w-full min-h-[300px] bg-white border border-[#E1E4EA] rounded-xl">
          <EmptyState icon={StickyNote} noun="Note" isFiltered />
        </div>
      ) : viewMode === "grid" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(311px, 1fr))",
            // Grid rows stretch every item to the row's tallest by default —
            // without this, a short note would still render as tall as its
            // longest neighbor in the same row instead of hugging its own content.
            alignItems: "start",
            gap: 24,
          }}
        >
          {filteredNotes.map((note) => (
            <NoteCard
              key={note._id}
              note={note}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onView={handleView}
              onDuplicate={handleDuplicate}
              noteTypes={noteTypes}
            />
          ))}
        </div>
      ) : (
        <div
          ref={fillContainerRef}
          className="box-border flex flex-col items-start w-full bg-white overflow-x-auto overflow-y-auto"
          style={{
            ...fillStyle,
            border: "1px solid #E1E4EA",
            borderRadius: 8,
            }}
        >
          <table
            className="text-sm text-left border-collapse"
            style={{ tableLayout: "fixed", width: "100%", minWidth: totalTableWidth, maxWidth: "100%" }}
          >
            {/* Sticky header. The table stays `border-collapse`, where borders on
                a sticky <thead> are dropped by the browser — so the divider lines
                are painted with inset boxShadow on each <th> instead. */}
            <thead className="bg-[#F5F7FA] sticky top-0 z-30">
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
                    <Checkbox checked={selectedItems.length > 0 && selectedItems.length === paginatedNotes.length} onChange={(e) => e.target.checked ? selectAll(paginatedNotes) : clearSelection()}  uncheckedColor="text-[#525866]"/>
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
                      className={`px-3 py-2.5 font-medium text-[#525252] text-xs cursor-grab active:cursor-grabbing bg-[#F5F7FA] ${isDragOver ? "bg-blue-100" : "hover:bg-gray-100"}`}
                    >
                      <div className={`flex items-center justify-between w-full ${showNotesSkeleton ? "[&_button]:invisible" : ""}`}>
                        {col.pinnable ? (
                          <div
                            className="relative flex items-center justify-start flex-1 group cursor-pointer select-none min-w-0"
                            onDoubleClick={() => togglePinColumn(col.id)}
                          >
                            <div className="flex items-center gap-1.5 flex-1 overflow-hidden">
                              {showNotesSkeleton ? <Skeleton width="65%" height={12} /> : (
                                <div className="flex items-center gap-1.5 min-w-0 truncate">
                                  <span className="truncate flex-1 min-w-0" title={col.label}>
                                    {col.label}
                                  </span>
                                  {(leftPinned.has(col.id) || rightPinned.has(col.id)) && (
                                    <Pin size={12} className="text-blue-500 fill-blue-500 flex-shrink-0 ml-1" style={{ transform: "rotate(45deg)" }} />
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5 whitespace-nowrap flex-1">
                            <span>{col.label}</span>
                            {sortConfig.key === col.id && (sortConfig.direction === "asc"
                              ? <ArrowUp className="w-3 h-3 text-[#0085FF] flex-shrink-0" />
                              : <ArrowDown className="w-3 h-3 text-[#0085FF] flex-shrink-0" />)}
                          </div>
                        )}

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
                        className={`absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-blue-400 z-10 ${resizingCol === col.id ? "bg-blue-500" : "bg-transparent"}`}
                      />
                      {boundarySide && <div style={getPinnedBoundaryOverlayStyle(boundarySide)} />}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E1E4EA] bg-white">
              {paginatedNotes.length === 0 ? (
                <tr>
                  <td colSpan={orderedColumns.length + 1}>
  <EmptyState icon={StickyNote} noun="Note" isFiltered />
</td>
                </tr>
              ) : (
                paginatedNotes.map((note) => {
                  const isSelected = selectedItems.includes(note._id);
                  const cells = {
                    title: (
                        <td key="title" style={{ height: 64 }} className="px-3 text-left border-r border-b border-[#E1E4EA]">
                          <span className="text-sm font-medium text-gray-900 truncate block">
                            <HighlightText text={note.title || "Untitled Note"} query={searchTerm} />
                          </span>
                        </td>
                    ),
                    type: (
                        <td key="type" style={{ height: 64 }} className="px-3 text-left border-r border-b border-[#E1E4EA]">
                          <span
                            className="inline-flex items-center justify-center text-xs font-medium"
                            style={{ padding: "4px 10px", borderRadius: 53, backgroundColor: "rgba(0, 133, 255, 0.1)", color: "#0085FF" }}
                          >
                            {note.noteType || "General Note"}
                          </span>
                        </td>
                    ),
                    description: (
                        <td key="description" style={{ height: 64 }} className="px-3 text-left border-r border-b border-[#E1E4EA]">
                          <span className="text-xs text-gray-500 truncate block">{note.company?.name || "{Deal Name/Activity/Invoice}"}</span>
                        </td>
                    ),
                    contacts: (
                        <td key="contacts" style={{ height: 64 }} className="px-3 border-r border-b border-[#E1E4EA]">
                          <div className="flex items-center justify-start gap-1.5">
                            <div
                              className="rounded-full bg-gray-200 flex items-center justify-center text-[9px] font-semibold text-gray-600 flex-shrink-0"
                              style={{ width: 18, height: 18 }}
                            >
                              {(typeof note.user === "object" ? note.user?.name : null)?.charAt(0)?.toUpperCase() || "?"}
                            </div>
                            <span className="text-xs font-medium text-gray-700 truncate">
                              {typeof note.user === "object" ? note.user?.name || "Unknown" : "Unknown"}
                            </span>
                          </div>
                        </td>
                    ),
                    company: (
                        <td key="company" style={{ height: 64 }} className="px-3 text-left border-r border-b border-[#E1E4EA]">
                          <div className="flex items-center justify-start gap-1 flex-wrap">
                            {note.taggedContacts?.length ? (
                              note.taggedContacts.slice(0, 3).map((c) => (
                                <span
                                  key={c._id}
                                  className="inline-flex items-center justify-center text-[10px] font-medium"
                                  style={{ padding: "3px 8px", borderRadius: 53, backgroundColor: "rgba(0, 133, 255, 0.1)", color: "#0085FF" }}
                                >
                                  {c.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </div>
                        </td>
                    ),
                    date: (
                        <td key="date" style={{ height: 64 }} className="px-3 text-left border-r border-b border-[#E1E4EA]">
                          <div className="flex flex-col">
                            <span className="text-xs font-medium text-gray-700 leading-tight">
                              {formatNoteDate(note.createdAt)}
                            </span>
                            <span className="text-[11px] text-gray-400 leading-tight">
                              {formatNoteTime(note.createdAt)}
                            </span>
                          </div>
                        </td>
                    ),
                    year: (
                        <td key="year" style={{ height: 64 }} className="px-3 text-left border-r border-b border-[#E1E4EA]">
                          <span className="text-xs text-gray-500">Team</span>
                        </td>
                    ),
                  };
                  const isActionsOpen = openRowActionsId === note._id;
                  const noteActionsButton = (
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
                          // approach as the Deals/Tasks/Meetings row-actions
                          // menus.
                          const zMenu = getAncestorZoom(document.body);
                          const MENU_W = 160;
                          const MENU_H = 148; // View Note + Edit Note + Duplicate Note + divider + Delete Note
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
                          setOpenRowActionsId(note._id);
                        }}
                        className="p-1 rounded hover:bg-gray-200 text-gray-800 transition-colors flex-shrink-0"
                        title="More options"
                      >
                        <MoreIcon className="w-4 h-4" />
                      </button>

                      {isActionsOpen && rowActionsPos && createPortal(
                        <>
                          <div className="fixed inset-0 z-[9998]" onClick={() => { setOpenRowActionsId(null); setRowActionsPos(null); }} />
                          <div
                            ref={rowActionsRef}
                            style={{ position: "fixed", top: rowActionsPos.top, left: rowActionsPos.left }}
                            className="w-[160px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => {
                                setOpenRowActionsId(null);
                                setRowActionsPos(null);
                                handleView(note);
                              }}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                            >
                              <EyeIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                              View Note
                            </button>
                            <button
                              onClick={() => {
                                setOpenRowActionsId(null);
                                setRowActionsPos(null);
                                handleEdit(note);
                              }}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                            >
                              <EditIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                              Edit Note
                            </button>
                            <button
                              onClick={() => {
                                setOpenRowActionsId(null);
                                setRowActionsPos(null);
                                handleDuplicate(note);
                              }}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                            >
                              <Copy className="w-3.5 h-3.5 text-[#1C1B1F]" />
                              Duplicate Note
                            </button>
                            <div className="w-full border-t border-[#F1F1F5] my-0.5" />
                            <button
                              onClick={() => {
                                setOpenRowActionsId(null);
                                setRowActionsPos(null);
                                setNoteToDelete(note);
                              }}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-red-600 hover:bg-red-50 whitespace-nowrap"
                            >
                              <DeleteIcon className="w-4 h-4" />
                              Delete Note
                            </button>
                          </div>
                        </>,
                        document.body
                      )}
                    </div>
                  );
                  return (
                    <tr key={note._id} className={`hover:bg-gray-50 transition-colors group ${isSelected ? "!bg-blue-50" : ""}`}>
                      <td
                        style={{
                          height: 64,
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
                          <Checkbox checked={isSelected} onChange={() => toggleItem(note._id)} />
                        </div>
                      </td>
                      {/* Cells indexed by column id and rendered through orderedColumns,
                          so hide/pin in the header moves its data cell too. */}
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
                                {noteActionsButton}
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



      {noteToDelete && (
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
                Delete note "{noteToDelete.title || "Note"}"? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setNoteToDelete(null)}
                  disabled={deletingNote}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteNoteConfirmed}
                  disabled={deletingNote}
                  className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  {deletingNote ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <NoteEditor
        isOpen={isEditorOpen}
        onClose={resetForm}
        noteTitle={noteTitle}
        setNoteTitle={setNoteTitle}
        noteContent={noteContent}
        setNoteContent={setNoteContent}
        taggedContacts={taggedContacts}
        setTaggedContacts={setTaggedContacts}
        contacts={contacts}
        noteType={noteType}
        setNoteType={setNoteType}
        visibility={visibility}
        setVisibility={setVisibility}
        onSave={handleAddOrUpdateNote}
        onDelete={() => handleDelete(editingNoteId)}
        loading={loading}
        isEditing={!!editingNoteId}
      />

      <NoteViewer
        isOpen={isViewerOpen}
        onClose={closeViewer}
        note={viewingNote}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

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
                Delete {selectedItems.length} selected note{selectedItems.length !== 1 ? 's' : ''}? This action cannot be undone.
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
    </div>
  );
}
