import CalendarIcon from "../components/common/CalendarIcon";
import VideoIcon from "../components/common/VideoIcon";
import PlusIcon from "../components/common/PlusIcon";
import MoreIcon from "../components/common/MoreIcon";
import React, { useEffect, useState, useRef, useMemo, useLayoutEffect } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import API from "../services/api";
import { useTopLoadingSignal } from "../components/common/TopLoadingBar";
import ProfilePicture from "../components/contact/ProfilePicture";
import Skeleton from "../components/common/Skeleton";
import StatTileSkeleton from "../components/common/StatTileSkeleton";
import StatTile from "../components/common/StatTile";
import TableSkeletonRows from "../components/common/TableSkeletonRows";
import PaymentsTable from "../components/vendor/PaymentsTable";
import NoteSection from "../components/vendor/NoteSection";
import VendorTasksTable from "../components/vendor/VendorTasksTable";
import VendorMeetingsTable from "../components/vendor/VendorMeetingsTable";
import VendorCalendar from "../components/vendor/VendorCalendar";
import QuickVendorForm from "../components/vendor/QuickVendorForm";
import PageSkeleton from "../components/common/PageSkeleton";
import toast from "react-hot-toast";
import CallingIcon from "../components/common/CallingIcon";
import {
  Twitter,
  Linkedin,
  Instagram,
  Receipt,
  CheckSquare,
  FolderOpen,
  FilePlus,
  ChevronDown,
  StickyNote,
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
import { FaWhatsapp } from "react-icons/fa";
import EyeIcon from "../components/common/EyeIcon";
import EditIcon from "../components/common/EditIcon";

// New Entry dropdown options — same shape/pattern as CompanyProfilePage.jsx's
// newEntryOptions, scoped to what this page actually has tabs for. Unlike
// Companies' pendingCreate mechanism, these just switch tabs; none of the
// vendor tab components currently accept an "auto-open create" prop, so
// Each option now also carries a `create` key, consumed the same way
// CompanyProfilePage.jsx's pendingCreate does — set alongside the tab
// switch, and cleared by the target tab once it's auto-opened its create
// form, so New Entry jumps straight into the form instead of just the tab.
const vendorNewEntryOptions = [
  { label: "New Payment", icon: Receipt, tab: "Payments", create: "payment" },
  { label: "New Note", icon: StickyNote, tab: "Notes", create: "note" },
  { label: "New Task", icon: CheckSquare, tab: "Tasks", create: "task" },
  { label: "New Meeting", icon: CalendarIcon, tab: "Meetings", create: "meeting" },
];

/* ─── Tab Configuration ─── */
const tabs = ["Overview", "Payments", "Notes", "Tasks", "Meetings", "Calendar"];

/* ─── Financial Summary Icons ─── */
// Bare icon components, matching CompanyProfilePage.jsx's statTiles pattern
// (e.g. LifetimeRevenueIcon) — the icon renders itself only, sized via the
// `size` prop; the bordered box around it lives in the tile markup, not in
// here, so both pages' KPI tiles share one box style instead of each icon
// bringing its own.
const TotalReceivedIcon = ({ size = 20 }) => <CallingIcon style={{ width: size * 0.8, height: size * 0.8 }} />;
const TotalPaidIcon = ({ size = 20 }) => <Receipt size={size} />;
const NetBalanceIcon = ({ size = 20 }) => <CheckSquare size={size} />;

/* ─── Reusable UI Components ─── */
/* Shared placeholder for every tab's table body. Renders a real <table> so the
   column widths/borders line up edge-to-edge with the tables it stands in for,
   and reuses the common TableSkeletonRows rather than hand-rolling rows. */
export const TabTableSkeleton = () => (
  <div>
    {/* Every tab (Payments/Notes/Tasks/Meetings) shows its own 4-tile KPI
        row above the toolbar once loaded — without this, that row popped
        in as a layout shift right as the table skeleton resolved. */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      {Array.from({ length: 4 }).map((_, i) => <StatTileSkeleton key={i} />)}
    </div>
    <div className="bg-white border border-[#E1E4EA] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E1E4EA]">
        <Skeleton width={160} height={14} />
        <div className="flex items-center gap-2">
          <Skeleton width={110} height={32} />
          <Skeleton width={110} height={32} />
        </div>
      </div>
      <table className="w-full border-separate border-spacing-0 text-left">
      <thead className="bg-[#F5F7FA]">
        <tr>
          <th style={{ width: 44 }} className="px-4 py-3 border-b border-r border-[#E1E4EA]">
            <Skeleton width={16} height={16} />
          </th>
          {[190, 150, 150, 150, 130].map((w, i) => (
            <th
              key={i}
              style={{ width: w }}
              className="px-4 py-3 border-b border-r border-[#E1E4EA] last:border-r-0"
            >
              <Skeleton width="70%" height={12} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="bg-white">
        <TableSkeletonRows
          numRows={8}
          columns={[190, 150, 150, 150, 130]}
          hasCheckbox
          checkboxWidth={44}
        />
      </tbody>
    </table>
    <div className="flex items-center justify-between px-4 py-3 border-t border-[#E1E4EA]">
      <Skeleton width={180} height={13} />
      <div className="flex items-center gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} width={32} height={32} shape="circle" />
        ))}
      </div>
    </div>
    </div>
  </div>
);

const RelationshipGauge = ({ score, label, radius = 58, stroke = 13 }) => {
  // Geometry is derived from the radius so the arc, the box and the stroke stay
  // in proportion at any size. The gauge now owns its own full-height column
  // in the header (see the SECTION 1 grid below), so it can afford to be
  // larger than when it had to share a row with the action icons.
  const width = radius * 2 + stroke;
  const height = radius + stroke / 2;
  const startX = stroke / 2;
  const endX = width - stroke / 2;
  const arcLength = Math.PI * radius;
  const strokeDashoffset = arcLength * (1 - score / 100);
  const arcPath = `M ${startX},${height} A ${radius},${radius} 0 0,1 ${endX},${height}`;
  // Font sizes scale with radius so a bigger gauge (full-height header column)
  // reads proportionally larger instead of looking like a small gauge in a
  // huge empty box.
  const scale = radius / 58;

  return (
    <div className="flex flex-col items-center">
      <span
        className="font-semibold text-gray-700 mb-2"
        style={{ fontSize: 13 * scale }}
      >
        Relationship Health
      </span>
      <div
        className="relative flex justify-center items-end"
        style={{ width, height }}
      >
        <svg
          className="absolute bottom-0 overflow-visible"
          style={{ width, height }}
        >
          {/* Background Arc */}
          <path d={arcPath} fill="none" stroke="#e0f2fe" strokeWidth={stroke} strokeLinecap="round" />
          {/* Foreground Arc */}
          <path
            d={arcPath}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={arcLength}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>
        <div className="flex flex-col items-center z-10 pb-0.5">
          <span
            className="font-bold text-blue-600 leading-none"
            style={{ fontSize: 24 * scale }}
          >
            {score}%
          </span>
          <span
            className="font-semibold text-gray-900 mt-1"
            style={{ fontSize: 11 * scale }}
          >
            {label}
          </span>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   VENDOR DETAILS PAGE (NEW)
   ═══════════════════════════════════════════════════════════════════════════ */
const VendorDetailsPageNew = () => {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  /* ── State ── */
  const [vendor, setVendor] = useState(null);
  const [payments, setPayments] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [notes, setNotes] = useState([]);
  const [vendorFieldList, setVendorFieldList] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Tab management (synced to URL)
  const tabFromUrl = searchParams.get("tab");
  const [activeTab, setActiveTabState] = useState(
    tabs.includes(tabFromUrl) ? tabFromUrl : "Overview"
  );
  const setActiveTab = (tab) => {
    setActiveTabState(tab);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", tab);
        return next;
      },
      { replace: true }
    );
  };

  // Sliding pill indicator
  const tabRefs = useRef({});
  const tabTrackRef = useRef(null);
  const [tabIndicator, setTabIndicator] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const el = tabRefs.current[activeTab];
      // Ignore zero-width reads: the button can be measured before the web
      // font lands or while an ancestor is still laying out, and writing a 0
      // here leaves the pill invisible with no later event to correct it.
      if (el && el.offsetWidth > 0) {
        setTabIndicator({ left: el.offsetLeft, width: el.offsetWidth });
      }
    };
    measure();
    // Re-measure after paint too — the first synchronous pass can land
    // before layout has settled, which is what left the pill missing on the
    // active tab at load.
    const raf = requestAnimationFrame(measure);

    // Same fix as CompanyProfilePage: a refresh landing directly on a
    // non-default tab mounts this row while the header is still showing
    // loading skeletons. Observe every tab button, not just the track — a
    // tab's own width can change (font swap) without the track resizing.
    const ro = new ResizeObserver(measure);
    if (tabTrackRef.current) ro.observe(tabTrackRef.current);
    Object.values(tabRefs.current).forEach((el) => el && ro.observe(el));

    // Fonts finishing load reflows the labels after every observer above has
    // already settled.
    if (document.fonts?.ready) document.fonts.ready.then(measure).catch(() => {});

    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // `dataLoaded` (not showSkeleton) — showSkeleton is declared further
    // down and referencing it here is a temporal dead zone error.
  }, [activeTab, dataLoaded]);

  // Header strip is normal document flow now (see the render below), so it
  // no longer needs position measurement — kept as a plain ref in case
  // future code needs to read its size.
  const stripRef = useRef(null);

  // Right column (Relationship Health + Activity Timeline) height, measured
  // from the left column's real rendered height — CSS Grid's own row-stretch
  // can't be trusted here because the right column's own content (a
  // flex-1 scrollable list with no intrinsic cap) would otherwise define
  // the row's "auto" height instead of following the left column, making
  // the timeline balloon to fit all its items instead of stopping at the
  // Financial Overview card's bottom edge.
  const leftColRef = useRef(null);
  const [leftColHeight, setLeftColHeight] = useState(null);
  useLayoutEffect(() => {
    const el = leftColRef.current;
    if (!el || activeTab !== "Overview") return;
    // Ignore sub-pixel churn: the observed element and the element this
    // height is applied to share a grid row, so a jittery value here can
    // ping-pong with layout instead of settling.
    const measure = () => {
      const next = el.getBoundingClientRect().height;
      setLeftColHeight((prev) => (prev != null && Math.abs(prev - next) < 1 ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [activeTab, dataLoaded]);

  // Which tab's "add" form the New Entry menu should auto-open once its tab
  // mounts — same pendingCreate pattern CompanyProfilePage.jsx uses.
  const [pendingCreate, setPendingCreate] = useState(null);

  // Actions menu
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const actionsMenuRef = useRef(null);
  const [showNewEntryMenu, setShowNewEntryMenu] = useState(false);
  const newEntryRef = useRef(null);
  const [showKPI, setShowKPI] = useState(true);

  // Edit form
  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [additionalFieldValues, setAdditionalFieldValues] = useState({});
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    category: "Vendor",
    company: "",
    website: "",
    address: { line1: "", line2: "", city: "", state: "", pincode: "", country: "" },
    avatar: "",
    socialMedia: { twitter: "", linkedin: "", instagram: "", facebook: "", whatsapp: "" },
  });

  // Activity timeline filter
  const [activityFeedFilter, setActivityFeedFilter] = useState("All");

  /* ── Skeleton loading ── */
  const showSkeleton = !dataLoaded;
  useTopLoadingSignal(showSkeleton);

  /* ── Data Fetching ──
     The timeline aggregates payments + tasks + meetings + notes, so all four
     are fetched here. Payments/tasks/meetings/notes are fetched with
     allSettled and each defaults to [] on failure (logged to console) — one
     failing feed source degrades that category instead of blanking the whole
     page. Only the core vendor fetch is fatal — if that fails, loadError is
     set so the page can show a clear "couldn't load" state instead of
     silently rendering with vendor=null. */
  const fetchVendorDetails = async () => {
    setLoadError(null);
    try {
      const resVendor = await API.get(`/vendors/${id}`);
      setVendor(resVendor.data);
    } catch (err) {
      console.error("Failed to load vendor profile:", err.response?.status, err.response?.data || err.message);
      setLoadError(err.response?.status === 404 ? "not_found" : "error");
      setDataLoaded(true);
      return;
    }

    const [paymentsRes, tasksRes, meetingsRes, notesRes] = await Promise.allSettled([
      API.get(`/vendors/${id}/payments`),
      API.get(`/tasks/vendor/${id}`),
      API.get("/meetings", { params: { vendorId: id } }),
      API.get(`/vendor-notes/vendor/${id}`),
    ]);

    if (paymentsRes.status === "fulfilled") {
      setPayments(paymentsRes.value.data);
    } else {
      console.error("Failed to load vendor payments:", paymentsRes.reason?.response?.status, paymentsRes.reason?.message);
      setPayments([]);
    }
    if (tasksRes.status === "rejected") {
      console.error("Failed to load vendor tasks:", tasksRes.reason?.response?.status, tasksRes.reason?.message);
    }
    setTasks(tasksRes.status === "fulfilled" ? tasksRes.value.data || [] : []);
    if (meetingsRes.status === "rejected") {
      console.error("Failed to load vendor meetings:", meetingsRes.reason?.response?.status, meetingsRes.reason?.message);
    }
    setMeetings(
      meetingsRes.status === "fulfilled"
        ? meetingsRes.value.data?.meetings || meetingsRes.value.data || []
        : []
    );
    if (notesRes.status === "rejected") {
      console.error("Failed to load vendor notes:", notesRes.reason?.response?.status, notesRes.reason?.message);
    }
    setNotes(notesRes.status === "fulfilled" ? notesRes.value.data || [] : []);

    try {
      const resFields = await API.get("/vendor-fields/latest");
      const fieldData = resFields.data?.fields || [];
      setVendorFieldList(fieldData);
    } catch (fieldErr) {
      console.error("Failed to load vendor fields template:", fieldErr);
    }

    setDataLoaded(true);
  };

  useEffect(() => {
    fetchVendorDetails();
  }, [id]);

  // Close menus on outside click (or scroll)
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target)) {
        setShowActionsMenu(false);
      }
      if (newEntryRef.current && !newEntryRef.current.contains(event.target)) {
        setShowNewEntryMenu(false);
      }
    };
    const handleScroll = () => {
      setShowActionsMenu(false);
      setShowNewEntryMenu(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, []);

  /* ── Helpers ── */
  // Same check as CompanyProfilePage.jsx's hasSocialLink — drives the
  // disabled/enabled styling on the social icon buttons below.
  const hasSocialLink = (platform) => {
    return vendor?.socialMedia?.[platform] && vendor.socialMedia[platform].trim() !== "";
  };

  const openSocialLink = (platform) => {
    const urlOrNumber = vendor?.socialMedia?.[platform];
    if (urlOrNumber && urlOrNumber.trim() !== "") {
      if (platform === "whatsapp") {
        const cleanNumber = urlOrNumber.replace(/[^\d+]/g, "");
        const senderName = JSON.parse(localStorage.getItem("user") || "{}").name || "";
        const opener = `Hello ${vendor?.name || ""}, this is ${senderName}.`.replace(/\s+/g, " ").trim();
        window.open(`https://wa.me/${cleanNumber}?text=${encodeURIComponent(opener)}`, "_blank", "noopener,noreferrer");
      } else {
        window.open(urlOrNumber, "_blank", "noopener,noreferrer");
      }
    }
  };

  const formatAddress = (address) => {
    if (!address) return "";
    if (typeof address === "string") return address;
    const parts = [
      address.line1,
      address.line2,
      address.city,
      address.state && address.pincode
        ? `${address.state}${address.stateCode ? ` (${address.stateCode})` : ""} ${address.pincode}`
        : address.state || address.pincode,
      address.country,
    ].filter(Boolean);
    return parts.join(", ");
  };

  const handleEdit = () => {
    setForm({
      _id: vendor._id,
      name: vendor.name || "",
      email: vendor.email || "",
      phone: vendor.phone || "",
      category: vendor.category || "Vendor",
      company: vendor.company || "",
      website: vendor.website || "",
      address: vendor.address || {
        line1: "", line2: "", city: "", state: "", stateCode: "", pincode: "", country: "",
      },
      avatar: vendor.avatar || vendor.logo || "",
      // All 5 fields — see the matching comment in Vendors.jsx:handleEditVendor.
      // This copy was missing `instagram`, which VendorForm still submits on
      // every save, silently wiping any stored Instagram link on unrelated edits.
      socialMedia: {
        twitter: vendor.socialMedia?.twitter || "",
        linkedin: vendor.socialMedia?.linkedin || "",
        instagram: vendor.socialMedia?.instagram || "",
        facebook: vendor.socialMedia?.facebook || "",
        whatsapp: vendor.socialMedia?.whatsapp || "",
      },
      gstin: vendor.gstin || "",
    });
    const processedFields = {};
    if (vendor.additionalFields) {
      vendor.additionalFields.forEach((field) => {
        processedFields[field.key] = field.value;
      });
    }
    setAdditionalFieldValues(processedFields);
    setShowForm(true);
  };

  /* ── Activity Feed (aggregated from payments/tasks/meetings/notes) ──
     Each source maps to its own date field: payments use paymentDate, tasks
     dueDate, meetings scheduledAt, notes createdAt. */
  const activityFeedItems = useMemo(() => {
    const items = [];

    if (Array.isArray(payments)) {
      payments.forEach((p) => {
        items.push({
          type: "Payments",
          icon: Receipt,
          iconClass: "bg-green-50 text-green-600",
          title: `Payment ${p.direction === "IN" ? "Received" : "Made"}`,
          subtitle: p.description || p.notes || null,
          date: new Date(p.paymentDate || p.createdAt),
        });
      });
    }

    if (Array.isArray(tasks)) {
      tasks.forEach((t) => {
        items.push({
          type: "Tasks",
          icon: CheckSquare,
          iconClass: "bg-blue-50 text-blue-600",
          title: t.title || "Task",
          subtitle: t.status || t.description || null,
          date: new Date(t.dueDate || t.selectedDate || t.createdAt),
        });
      });
    }

    if (Array.isArray(meetings)) {
      meetings.forEach((m) => {
        items.push({
          type: "Meetings",
          icon: VideoIcon,
          iconClass: "bg-purple-50 text-purple-600",
          title: m.title || "Meeting",
          subtitle: m.status || m.meetingType || null,
          date: new Date(m.scheduledAt || m.createdAt),
        });
      });
    }

    if (Array.isArray(notes)) {
      notes.forEach((n) => {
        items.push({
          type: "Notes",
          icon: FilePlus,
          iconClass: "bg-orange-50 text-orange-600",
          title: n.title || "Untitled Note",
          subtitle: String(n.note || "").replace(/<[^>]*>/g, "").trim() || null,
          date: new Date(n.createdAt),
        });
      });
    }

    // NOT capped here. Capping before the tab filter is what caused "All"/
    // "Payments"/"Notes" to show nothing: if the 25 most recent items across
    // ALL types happened to be tasks/meetings, older payments/notes were
    // discarded before the tab filter ever ran, even though they existed.
    // Filtering happens on this full list below; the cap is applied per-tab,
    // after filtering.
    return items
      .filter((item) => !isNaN(item.date))
      .sort((a, b) => b.date - a.date);
  }, [payments, tasks, meetings, notes]);

  // "Deals" dropped — vendor deals aren't a feature yet, so the filter can
  // never match anything. Notes added since the feed now carries them.
  const activityFeedTabs = ["All", "Payments", "Tasks", "Meetings", "Notes"];
  const filteredActivityFeed = useMemo(() => {
    const matching =
      activityFeedFilter === "All"
        ? activityFeedItems
        : activityFeedItems.filter((item) => item.type === activityFeedFilter);
    // Sidebar container shows ~4-5 rows and scrolls for more (see maxHeight
    // below), so keep enough behind the fold to be worth scrolling.
    return matching.slice(0, 25);
  }, [activityFeedItems, activityFeedFilter]);

  /* ── Financial Summary Calculations ── */
  const totalReceived = payments
    ? payments
      .filter((p) => p.direction === "IN")
      .reduce((sum, p) => sum + (p.amount || 0), 0)
    : 0;
  const totalPaid = payments
    ? payments
      .filter((p) => p.direction === "OUT")
      .reduce((sum, p) => sum + (p.amount || 0), 0)
    : 0;
  // Net Balance = Total Given - Total Got (money out, less what came back).
  // The server derives these from the Payment ledger; the local sums are the
  // fallback for a vendor payload fetched before that was attached.
  const netBalance = vendor?.netBalance ?? totalPaid - totalReceived;

  /* ── Financial Overview chart ──
     Same design/markup as CompanyProfilePage.jsx's Financial Overview card
     (which replaced its own Custom Fields card the same way) — only the
     parameters differ: invoices → payments, "income" → monthly amount
     received from the vendor, "hasPayment" → month also had a payment made
     to the vendor. */
  const financialTiles = [
    { label: "Total Received", value: `₹${totalReceived.toLocaleString("en-IN")}`, icon: TotalReceivedIcon },
    { label: "Total Paid", value: `₹${totalPaid.toLocaleString("en-IN")}`, icon: TotalPaidIcon },
    {
      label: "Net Balance",
      value: `₹${Math.abs(netBalance).toLocaleString("en-IN")}`,
      icon: NetBalanceIcon,
      valueClassName: netBalance >= 0 ? "text-green-600" : "text-red-600",
    },
    { label: "Transactions", value: (payments || []).length, icon: Clock },
  ];

  const incomeChartScrollRef = useRef(null);
  const chartDotCursorSvg = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><g filter="url(#filter0_dd_2154_683)"><rect x="4" y="2" width="12" height="12" rx="6" fill="white"/><rect x="5" y="3" width="10" height="10" rx="5" stroke="#0F0E0E" stroke-width="2"/></g><defs><filter id="filter0_dd_2154_683" x="0" y="0" width="20" height="20" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/><feOffset dy="2"/><feGaussianBlur stdDeviation="2"/><feColorMatrix type="matrix" values="0 0 0 0 0.196487 0 0 0 0 0.196487 0 0 0 0 0.279476 0 0 0 0.06 0"/><feBlend mode="multiply" in2="BackgroundImageFix" result="effect1_dropShadow_2154_683"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/><feOffset dy="2"/><feGaussianBlur stdDeviation="1"/><feColorMatrix type="matrix" values="0 0 0 0 0.196487 0 0 0 0 0.196487 0 0 0 0 0.279476 0 0 0 0.06 0"/><feBlend mode="multiply" in2="effect1_dropShadow_2154_683" result="effect2_dropShadow_2154_683"/><feBlend mode="normal" in="SourceGraphic" in2="effect2_dropShadow_2154_683" result="shape"/></filter></defs></svg>`;
  const chartDotCursor = `url("data:image/svg+xml,${encodeURIComponent(chartDotCursorSvg)}") 10 10, auto`;

  // Bucket received amounts by month for the last 12 months (oldest to newest).
  const monthlyIncomeData = useMemo(() => {
    const buckets = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        month: d.toLocaleDateString("en-US", { month: "short" }),
        income: 0,
        paid: 0,
      });
    }
    (payments || []).forEach((p) => {
      const paymentDate = p.paymentDate || p.createdAt;
      if (!paymentDate) return;
      const d = new Date(paymentDate);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const bucket = buckets.find((b) => b.key === key);
      if (!bucket) return;
      if (p.direction === "IN") bucket.income += p.amount || 0;
      if (p.direction === "OUT") {
        bucket.paid += p.amount || 0;
        bucket.hasPayment = true;
      }
    });
    buckets.forEach((b) => {
      b.paidHighlight = b.hasPayment ? b.income : null;
    });
    return buckets;
  }, [payments]);

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

    const bandX = background?.x ?? x;
    const bandWidth = background?.width ?? width;
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
        <polygon points={points} fill="url(#vendorHoverGradient)" />
      </g>
    );
  };

  const incomeYMax = (() => {
    const max = Math.max(0, ...monthlyIncomeData.map((b) => Math.max(b.income, b.paid)));
    if (max === 0) return 100;
    const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
    return Math.ceil(max / magnitude) * magnitude;
  })();

  useEffect(() => {
    if (dataLoaded && incomeChartScrollRef.current) {
      incomeChartScrollRef.current.scrollLeft = incomeChartScrollRef.current.scrollWidth;
    }
  }, [dataLoaded]);

  /* ── Relationship Health score ──
     Was a hardcoded `score={82}` regardless of the vendor's actual data —
     looked "dummy" because it never changed. Computed from four signals,
     each 0-25: task completion rate, meeting completion rate, recent
     activity (any payment/task/meeting touched in the last 60 days), and
     balance health (not owing the vendor money). Vendors with no data in a
     category get that category's midpoint instead of 0, so a vendor with
     e.g. no meetings yet isn't dragged down by a category that doesn't
     apply. */
  const relationshipScore = useMemo(() => {
    const taskList = Array.isArray(tasks) ? tasks : [];
    const meetingList = Array.isArray(meetings) ? meetings : [];
    const paymentList = Array.isArray(payments) ? payments : [];

    const taskScore = taskList.length
      ? (taskList.filter((t) => t.status === "Completed").length / taskList.length) * 25
      : 12.5;
    const meetingScore = meetingList.length
      ? (meetingList.filter((m) => m.status === "completed").length / meetingList.length) * 25
      : 12.5;

    const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const hasRecentActivity =
      paymentList.some((p) => new Date(p.paymentDate || p.createdAt).getTime() >= sixtyDaysAgo) ||
      taskList.some((t) => new Date(t.dueDate || t.createdAt).getTime() >= sixtyDaysAgo) ||
      meetingList.some((m) => new Date(m.scheduledAt || m.createdAt).getTime() >= sixtyDaysAgo);
    const activityScore = hasRecentActivity ? 25 : 10;

    const balanceScore = netBalance >= 0 ? 25 : Math.max(0, 25 - Math.abs(netBalance) / 1000);

    return Math.round(taskScore + meetingScore + activityScore + balanceScore);
  }, [tasks, meetings, payments, netBalance]);

  const relationshipLabel = (() => {
    if (relationshipScore >= 80) return "Excellent";
    if (relationshipScore >= 60) return "Good";
    if (relationshipScore >= 40) return "Fair";
    return "Needs Attention";
  })();

  const fmtMoney = (n) =>
    `₹${(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  /* ── Full-page skeleton while data loads ── */
  if (!vendor && showSkeleton) {
    return <PageSkeleton variant="profile" />;
  }

  /* ── Vendor fetch failed (404 / network / server error) — show a clear
     terminal state instead of silently rendering a half-empty page with
     vendor=null. The actual status/body is logged to console by
     fetchVendorDetails for diagnosis. ── */
  if (!vendor && loadError) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-center px-6">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
          <FolderOpen className="w-8 h-8 text-gray-400" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">
          {loadError === "not_found" ? "Vendor not found" : "Couldn't load this vendor"}
        </h2>
        <p className="text-sm text-gray-500 max-w-sm">
          {loadError === "not_found"
            ? "This vendor doesn't exist or may have been removed."
            : "Something went wrong while loading this vendor. Check the console for details, or try again."}
        </p>
        <button
          onClick={fetchVendorDetails}
          className="mt-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  /* ═══════════════════ RENDER ═══════════════════ */
  return (
    <div className="min-h-screen bg-white -mt-6 -mx-4 sm:-mx-6 lg:-mx-8 pt-6 overflow-x-hidden">
      {/* ── Edit Form Modal ── */}
      {showForm && (
        <QuickVendorForm
          editVendor={vendor}
          onVendorUpdated={() => {
            setShowForm(false);
            fetchVendorDetails();
          }}
          onRequestClose={() => setShowForm(false)}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════
          SECTION 1 — HEADER CARD
          Grid, not a stacked flex: the gauge column is a single grid
          item spanning the full card height (grid rows stretch to the
          tallest sibling by default), so it fills the whole right side
          instead of sharing a row with the action icons. The left
          column stacks info+icons on top and the KPI strip below it —
          only that column gets the horizontal divider, so it never
          cuts across the gauge. Padding kept tight so this card plus
          the tab bar below never forces the page to scroll before the
          table is visible.
         ═══════════════════════════════════════════════════════════ */}
      {/* Normal document flow — NOT fixed/sticky — same as
          CompanyProfilePage.jsx's header: it scrolls away with the page
          instead of staying pinned under the navbar. Starts at the same
          spot right under the navbar since it's the first thing in the
          page's flow. The tab switcher + its divider are folded into this
          same block so they scroll together as one unit. */}
      <div ref={stripRef} className="px-6">
        <div>

          <div className="flex flex-col min-w-0">
            {/* Info strip — compact single row (avatar + name + address on
                the left, actions on the right), matching the header on
                CompanyProfilePage.jsx rather than the tall bordered card
                this used to be. The email/phone/address detail that used to
                stack here now lives in the Overview tab's Vendor Details. */}
            {/* No fixed height, no absolute positioning — plain
                `flex items-center justify-between`, same as
                CompanyProfilePage.jsx. Flexbox's own align-items: center
                already centers both sides on one shared midline (they're
                direct siblings of the same flex row), so the row's height
                is whatever the taller side naturally needs — matching
                Companies exactly instead of forcing a fixed h-12/h-16 that
                can drift out of sync with the sidebar's own fixed-height
                blocks. */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3 min-w-0">
                {/* Gated on showSkeleton, not just `vendor` — the vendor fetch
                  resolves well before payments/tasks/meetings/notes do, so
                  gating on `vendor` alone made the header pop in with real
                  data while the KPI strip/table/timeline below it were still
                  skeletons. Everything below now flips from skeleton to real
                  content in the same render, like CompanyProfilePage.jsx. */}
                {!showSkeleton && vendor ? (
                  <ProfilePicture
                    contact={{ name: vendor.name, avatar: vendor.avatar || vendor.logo }}
                    size="w-9 h-9"
                    textSize="text-sm"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
                )}

                <div className="min-w-0">
                  {!showSkeleton && vendor ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <h1 className="text-base font-semibold text-gray-900 truncate">
                        {vendor.name}
                      </h1>
                      <span className="flex-shrink-0 px-2 py-0.5 text-[10px] font-medium bg-green-50 text-green-700 rounded-full">
                        Active
                      </span>
                    </div>
                  ) : (
                    <Skeleton width={140} height={16} className="mb-1" />
                  )}

                  {/* Address has no top margin — same 2px trim as
                      CompanyProfilePage.jsx, so both detail strips line up
                      with the bottom border of the sidebar's switcher
                      section (Navbar.jsx renders it as `h-16 ... border-b`). */}
                  {!showSkeleton && vendor ? (
                    vendor.address && formatAddress(vendor.address) && (
                      <p className="text-xs text-gray-500 truncate">
                        {formatAddress(vendor.address)}
                      </p>
                    )
                  ) : (
                    <Skeleton width={100} height={11} />
                  )}
                </div>
              </div>

              {/* Action Toolbar — a plain flex sibling of the left block, so
                  flexbox centers it on the same midline. Structure matches
                  CompanyProfilePage.jsx exactly: socials, a "more actions"
                  (⋮) menu, a New Entry dropdown, and a standalone blue Edit
                  button — replacing the old bespoke Call/Email/Video/Note/
                  Deals icon row and the single dropdown that bundled Edit
                  Profile/KPI toggle/View Payments together. */}
              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                {/* Social icons — identical markup/classes to
                    CompanyProfilePage.jsx's Twitter/LinkedIn/Instagram group,
                    so the two detail pages read as the same component. */}
                <button
                  disabled={!hasSocialLink("twitter")}
                  className={`hidden lg:flex w-8 h-8 items-center justify-center rounded-full border transition-colors ${hasSocialLink("twitter")
                    ? "border-gray-200 text-gray-800 hover:bg-gray-50 cursor-pointer"
                    : "border-gray-200 text-gray-300 cursor-not-allowed"
                    }`}
                  onClick={() => openSocialLink("twitter")}
                  title={hasSocialLink("twitter") ? "View Twitter/X profile" : "No Twitter/X link available"}
                >
                  <Twitter size={16} strokeWidth={2} />
                </button>

                <button
                  disabled={!hasSocialLink("linkedin")}
                  className={`hidden lg:flex w-8 h-8 items-center justify-center rounded-full border transition-colors ${hasSocialLink("linkedin")
                    ? "border-gray-200 text-gray-800 hover:bg-gray-50 cursor-pointer"
                    : "border-gray-200 text-gray-300 cursor-not-allowed"
                    }`}
                  onClick={() => openSocialLink("linkedin")}
                  title={hasSocialLink("linkedin") ? "View LinkedIn profile" : "No LinkedIn link available"}
                >
                  <Linkedin size={16} strokeWidth={2} />
                </button>

                {/* Instagram — maps to "facebook", same convention as
                    CompanyProfilePage.jsx (no dedicated instagram field). */}
                <button
                  disabled={!hasSocialLink("facebook")}
                  className={`hidden lg:flex w-8 h-8 items-center justify-center rounded-full border transition-colors ${hasSocialLink("facebook")
                    ? "border-gray-200 text-gray-800 hover:bg-gray-50 cursor-pointer"
                    : "border-gray-200 text-gray-300 cursor-not-allowed"
                    }`}
                  onClick={() => openSocialLink("facebook")}
                  title={hasSocialLink("facebook") ? "View Instagram profile" : "No Instagram link available"}
                >
                  <Instagram size={16} strokeWidth={2} />
                </button>

                {/* More Actions (⋮) — Hide/Unhide KPIs, same as Companies'
                    "Hide/Unhide KPIs" entry (showStats there, showKPI here).
                    Edit is folded in here too, but only on mobile — desktop
                    has the standalone blue Edit button below. */}
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
                          setShowKPI((prev) => !prev);
                          setShowActionsMenu(false);
                        }}
                        className="flex items-center gap-1.5 lg:gap-2 w-full px-2 lg:px-3 py-1.5 lg:py-2 text-xs lg:text-sm font-normal text-gray-700 hover:bg-gray-50 text-left"
                      >
                        <EyeIcon size={12} className="text-gray-400 lg:hidden" />
                        <EyeIcon size={14} className="text-gray-400 hidden lg:block" />
                        {showKPI ? "Hide KPIs" : "Unhide KPIs"}
                      </button>
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
                      {vendorNewEntryOptions.map((option) => (
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
                          <option.icon size={12} className="text-gray-400 lg:hidden" />
                          <option.icon size={14} className="text-gray-400 hidden lg:block" />
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  title="Edit"
                  onClick={handleEdit}
                  className="hidden lg:flex items-center gap-1.5 px-4 h-8 text-sm font-medium text-white bg-[#0085FF] hover:bg-[#0078E8] rounded-full transition-colors"
                >
                  <EditIcon size={13} />
                  Edit
                </button>
              </div>
            </div>

          </div>

          {/* The Relationship Health gauge used to occupy a second column
              here. It now lives in the right sidebar above the Activity
              Timeline instead — see SECTION 3 & 5 below. */}

          {/* TABS — folded into the same fixed block as the info row above,
              so the divider and the tab switcher are pinned under the
              navbar too instead of scrolling away separately. py-4 (not
              mb-4) so the band has symmetric breathing room. */}
          <div className="border-b border-gray-200 -mx-6"></div>

          <div className="flex items-center justify-between py-4 gap-3 flex-wrap">
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
            <div id="tab-actions-portal" className="flex items-center gap-2"></div>
          </div>

          <div className="border-b border-gray-200 -mx-6"></div>
        </div>
      </div>

      <div className="mx-auto px-6 mt-4">
        {/* ═══════════════════════════════════════════════════════════
            SECTION 3 & 5 — CONTENT
           ═══════════════════════════════════════════════════════════ */}
        {/* The old generic Total Received/Total Paid/Net Balance strip that
            used to sit here was removed — those same three figures are now
            tiles inside the Financial Overview chart card below (Overview
            tab), and Payments' own KPI row already covers the Payments tab.
            Keeping both was two KPI rows saying the same thing. */}

        {/* Sidebar trimmed 272px -> 240px and the gap 6 -> 4, handing ~95px
            back to the table column so its right-most columns (Amount /
            Actions) fit without horizontal scrolling. Relationship Health +
            Activity Timeline are Overview-only (see the right column below),
            so the second grid column — and the gap that goes with it — only
            applies there; every other tab's table gets the full width. */}
        {/* items-start, not the default stretch: the right column is given an
            explicit pixel height measured from the left column, and a
            stretching row would let that height feed back into the row and
            grow the page on every measurement. */}
        <div className={`grid grid-cols-1 gap-3 items-start ${activeTab === "Overview" ? "lg:grid-cols-[1fr_240px]" : ""}`}>

          {/* ── Left Column: Active Tab Content ── */}
          <div ref={leftColRef} className="min-w-0 flex flex-col">


            <div className="min-h-[400px]">
              {/* One shared, edge-to-edge table skeleton for every tab (built from
                the common TableSkeletonRows) instead of a different hand-rolled
                placeholder per tab, so all four resolve identically off the
                single showSkeleton flag. The tab bar itself is never
                skeletoned — it's navigation, not data. */}
              {showSkeleton ? (
                <TabTableSkeleton />
              ) : (
                <>
                  {activeTab === "Overview" && (
                    <div className="space-y-4">
                      {/* Financial Overview — same design as
                          CompanyProfilePage.jsx's Financial Overview card,
                          replacing the plain Custom Fields list. Parameters
                          differ (payments instead of invoices) but the
                          chart markup/colors are identical. */}
                      <div
                        className="bg-white border border-gray-200 rounded-lg p-5 flex flex-col min-w-0"
                        style={{ height: 607, maxHeight: 607, minHeight: 607, flexShrink: 0, flexGrow: 0 }}
                      >
                        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex-shrink-0">
                          Financial Overview
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                          {financialTiles.map((tile) => (
                            <StatTile
                              key={tile.label}
                              tile={{
                                icon: tile.icon,
                                iconClass: "text-gray-500",
                                label: tile.label,
                                value: tile.value,
                                valueClassName: tile.valueClassName,
                              }}
                            />
                          ))}
                        </div>

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
                                    <linearGradient id="vendorHoverGradient" x1="0" y1="1" x2="0" y2="0">
                                      <stop offset="20.61%" stopColor="#0085FF" stopOpacity={0.6} />
                                      <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.024} />
                                    </linearGradient>
                                    <pattern id="vendorHatchPattern" patternUnits="userSpaceOnUse" width="9" height="8">
                                      <rect width="1" height="8" fill="rgba(0, 133, 255, 0.3)" />
                                    </pattern>
                                    {/* Paid series — same hatch-fill treatment as Received, just red
                                        instead of blue, so both lines read as one consistent pattern. */}
                                    <pattern id="vendorHatchPatternRed" patternUnits="userSpaceOnUse" width="9" height="8">
                                      <rect width="1" height="8" fill="rgba(239, 68, 68, 0.3)" />
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
                                      const paid = payload[0]?.payload?.paid || 0;
                                      return (
                                        <div
                                          style={{
                                            background: "#21201F",
                                            borderRadius: 10,
                                            padding: "10px 14px",
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 4,
                                            whiteSpace: "nowrap",
                                          }}
                                        >
                                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#0085FF", flexShrink: 0 }} />
                                            <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>
                                              {`₹${income.toLocaleString("en-IN")}`}
                                            </span>
                                            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 500 }}>
                                              Received
                                            </span>
                                          </div>
                                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444", flexShrink: 0 }} />
                                            <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>
                                              {`₹${paid.toLocaleString("en-IN")}`}
                                            </span>
                                            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 500 }}>
                                              Paid
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
                                    fill="url(#vendorHatchPattern)"
                                    isAnimationActive={false}
                                  />
                                  <Area
                                    type="linear"
                                    dataKey="paid"
                                    stroke="none"
                                    fill="url(#vendorHatchPatternRed)"
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
                                  {/* Paid — same line/dot styling as Received, just red, so both
                                      series read as the same visual pattern. */}
                                  <Area
                                    type="linear"
                                    dataKey="paid"
                                    stroke="#EF4444"
                                    strokeWidth={2}
                                    fill="none"
                                    dot={{ r: 3, fill: "#EF4444", strokeWidth: 0 }}
                                    activeDot={{ r: 5 }}
                                  />
                                </ComposedChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {activeTab === "Payments" && (
                    <PaymentsTable
                      payments={payments}
                      vendor={vendor}
                      showKPIs={showKPI}
                      autoOpenCreate={pendingCreate === "payment"}
                      onAutoOpenCreateConsumed={() => setPendingCreate(null)}
                    />
                  )}
                  {activeTab === "Notes" && (
                    <NoteSection
                      showKPIs={showKPI}
                      autoOpenCreate={pendingCreate === "note"}
                      onAutoOpenCreateConsumed={() => setPendingCreate(null)}
                    />
                  )}
                  {activeTab === "Tasks" && (
                    <VendorTasksTable
                      vendorId={id}
                      showKPIs={showKPI}
                      autoOpenCreate={pendingCreate === "task"}
                      onAutoOpenCreateConsumed={() => setPendingCreate(null)}
                    />
                  )}
                  {activeTab === "Meetings" && (
                    <VendorMeetingsTable
                      vendorId={id}
                      showKPIs={showKPI}
                      autoOpenCreate={pendingCreate === "meeting"}
                      onAutoOpenCreateConsumed={() => setPendingCreate(null)}
                    />
                  )}
                  {activeTab === "Calendar" && <VendorCalendar vendorId={id} />}
                </>
              )}
            </div>
          </div>

          {/* ── Right Column: Relationship Health + Activity Timeline ──
              Overview-only: these are a snapshot of the vendor as a whole,
              not something scoped to what a specific tab's table is
              showing, so they don't make sense pinned next to e.g. the
              Payments or Notes table. */}
          {activeTab === "Overview" && (
          <div
            className="hidden lg:flex lg:flex-col gap-3"
            style={{ height: leftColHeight != null ? `${leftColHeight}px` : undefined }}
          >
            {/* Vendor Snapshot — replaces the Relationship Health gauge,
                which was a single fuzzy 0-100 score that read as "made up"
                even once it was wired to real data. This instead surfaces
                concrete, individually-legible facts: how long the vendor's
                been onboarded, when they were last active, and what's
                outstanding right now — nothing here is a synthesized score. */}
            <div className="flex-shrink-0 bg-white border border-gray-200 rounded-xl p-4">
              {showSkeleton ? (
                <div className="space-y-3">
                  <Skeleton width={100} height={13} />
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <Skeleton width={70} height={11} />
                      <Skeleton width={50} height={11} />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Vendor Snapshot</h3>
                  <div className="space-y-2.5">
                    {[
                      {
                        label: "Onboarded",
                        value: vendor?.createdAt
                          ? new Date(vendor.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                          : "—",
                      },
                      {
                        label: "Last Activity",
                        value: activityFeedItems[0]
                          ? activityFeedItems[0].date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                          : "No activity yet",
                      },
                      {
                        label: "Pending Tasks",
                        value: tasks.filter((t) => t.status !== "Completed").length,
                        valueClass: tasks.filter((t) => t.status !== "Completed").length > 0 ? "text-amber-600" : "text-gray-900",
                      },
                      {
                        label: "Upcoming Meetings",
                        value: meetings.filter((m) => m.scheduledAt && new Date(m.scheduledAt) >= new Date()).length,
                      },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-3">
                        <span className="text-xs text-gray-600">{row.label}</span>
                        <span className={`text-xs font-semibold ${row.valueClass || "text-gray-900"}`}>
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Stretches to fill the rest of the column, so this card's bottom
                edge lands on the same line as the left column's last card. The
                feed inside scrolls rather than growing the page — the runaway
                height this used to show was the grid feedback loop fixed
                further up, not this card filling its column. */}
            <div className="flex-1 min-h-0 flex flex-col bg-white border border-gray-200 rounded-xl p-3">
              {showSkeleton ? (
                <Skeleton width={110} height={14} className="mb-5 flex-shrink-0" />
              ) : (
                <h3 className="text-sm font-semibold text-gray-900 mb-5 flex-shrink-0">
                  Activity Timeline
                </h3>
              )}

              {/* Filter Tabs — single line, horizontally scrollable (swipeable
                  on touch) instead of wrapping to a second line, since 5 tabs
                  don't fit the sidebar's width on one row. */}
              {showSkeleton ? (
                // overflow-hidden + widths sized to the 240px sidebar card
                // (216px after its p-3 padding) so the placeholder pills
                // never spill past the card's border like the real,
                // horizontally-scrollable chip row is allowed to.
                <div className="flex items-center gap-1 mb-4 overflow-hidden flex-shrink-0">
                  {[28, 46, 36, 46, 36].map((w, i) => (
                    <Skeleton key={i} width={w} height={20} className="rounded-full flex-shrink-0" />
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-1 mb-4 overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden flex-shrink-0" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
                  {activityFeedTabs.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActivityFeedFilter(tab)}
                      className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${activityFeedFilter === tab
                          ? "bg-[#0085FF] text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              )}

              {/* Feed Items — fills the rest of the card (flex-1) instead of a
                  fixed 250px, so its bottom edge now tracks the card's own
                  stretched height (see the flex column wrapper above) rather
                  than being a fixed size regardless of how tall the card is. */}
              <div
                className="flex-1 min-h-0 space-y-4 overflow-y-auto [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {showSkeleton ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <Skeleton shape="circle" width={28} height={28} className="flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1 flex flex-col gap-1">
                        <Skeleton width="75%" height={11} />
                        <Skeleton width="40%" height={10} />
                      </div>
                    </div>
                  ))
                ) : filteredActivityFeed.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-xs text-gray-400 text-center">
                      No recent activity.
                    </p>
                  </div>
                ) : (
                  filteredActivityFeed.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2.5">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${item.iconClass}`}
                      >
                        <item.icon style={{ width: 13, height: 13 }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-900 leading-tight">
                          {item.title}
                        </p>
                        {item.subtitle && (
                          <p className="text-[11px] text-gray-500 truncate">
                            {item.subtitle}
                          </p>
                        )}
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {item.date.toLocaleDateString("en-US", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}{" "}
                          •{" "}
                          {item.date.toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default VendorDetailsPageNew;
