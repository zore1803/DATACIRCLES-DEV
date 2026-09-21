import CalendarIcon from "../components/common/CalendarIcon";
import DeleteIcon from "../components/common/DeleteIcon";
import PdfIcon from "../components/common/PdfIcon";
import PlusIcon from "../components/common/PlusIcon";
import MoreIcon from "../components/common/MoreIcon";
import React, { useEffect, useState, useRef, useLayoutEffect } from "react";
import { useParams, Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import API from "../services/api";
import { formatNumberToIndian } from "../utils/numberFormatter";
import QuickDealForm from "../components/deal/QuickDealForm";
import toast from "react-hot-toast";
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  StickyNote,
  Receipt,
  Clock,
  User,
  AlertCircle,
  IndianRupeeIcon,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import BasicDetails from "../components/deal/BasicDetails";
import CompanyInvoicesTab from "../components/company/CompanyInvoicesTab";
import CompanyNotesTab from "../components/company/CompanyNotesTab";
import CompanyTasksTab from "../components/company/CompanyTasksTab";
import CompanyMeetingsTab from "../components/company/CompanyMeetingsTab";
import CompanyCalendar from "../components/company/CompanyCalendar";
import ConfirmDialog from "../components/common/ConfirmDialog";
import StatTile from "../components/common/StatTile";
import StatTileSkeleton from "../components/common/StatTileSkeleton";
import Skeleton from "../components/common/Skeleton";
import PageSkeleton from "../components/common/PageSkeleton";
import AppToaster from "../components/AppToaster";
import EyeIcon from "../components/common/EyeIcon";
import EditIcon from "../components/common/EditIcon";

// Mirrors CompanyProfilePage's shape (header strip, one pill tab bar, KPI row,
// full-width tab bodies) so a company, one of its contacts and one of its
// deals all behave the same way. The tab set is the deal's own — Tasks,
// Meetings and Calendar were "coming soon" placeholders before this and now
// run the same components the company page uses, scoped to the deal.
const tabs = ["Overview", "Invoices", "Notes", "Tasks", "Meetings", "Calendar"];

const newEntryOptions = [
  { label: "New Invoice", icon: Receipt, tab: "Invoices", create: "invoice" },
  { label: "New Notes", icon: StickyNote, tab: "Notes" },
  { label: "New Task", icon: CheckSquare, tab: "Tasks" },
  { label: "New Meetings", icon: CalendarIcon, tab: "Meetings" },
];

// Deal status shown next to the title, in the same pill vocabulary the rest of
// the header uses.
const StatusBadge = ({ status }) => {
  const statusConfig = {
    open: { cls: "bg-[#E6F8FD] text-[#27B4EA] border-[#B8E9F7]", icon: <Clock className="w-3 h-3" /> },
    won: { cls: "bg-[#E6F7EF] text-[#1FA971] border-[#B9E7D3]", icon: <CheckCircle2 className="w-3 h-3" /> },
    lost: { cls: "bg-[#FCEAEA] text-[#EA4B4B] border-[#F5C7C7]", icon: <XCircle className="w-3 h-3" /> },
    pending: { cls: "bg-[#FDF3E6] text-[#EA9927] border-[#F7DDB8]", icon: <AlertCircle className="w-3 h-3" /> },
    default: { cls: "bg-[#EEF2F9] text-[#56698A] border-[#D6DEEC]", icon: <AlertCircle className="w-3 h-3" /> },
  };
  const config = statusConfig[status?.toLowerCase()] || statusConfig.default;
  return (
    <span className={`flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium border rounded-full px-2 py-0.5 ${config.cls}`}>
      {config.icon}
      <span className="capitalize">{status}</span>
    </span>
  );
};

function DealDetail() {
  const { dealId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // The list of deal ids the user was browsing (whatever search/filter was
  // active on the Deals list) when they clicked into this deal — lets the
  // prev/next arrows step through that same set instead of every deal.
  const dealIds = location.state?.dealIds || null;
  const dealIdsIndex = dealIds ? dealIds.indexOf(dealId) : -1;
  const prevDealId = dealIdsIndex > 0 ? dealIds[dealIdsIndex - 1] : null;
  const nextDealId =
    dealIdsIndex !== -1 && dealIdsIndex < dealIds?.length - 1
      ? dealIds[dealIdsIndex + 1]
      : null;
  const goToDeal = (id) => {
    if (!id) return;
    navigate(`/deals/${id}`, { state: { dealIds } });
  };

  const [deal, setDeal] = useState(null);
  const [invoices, setInvoices] = useState([]);
  // "New Invoice" in the New menu: switches to the Invoices tab AND opens the
  // create form there, the same as the Company page does.
  const [pendingCreate, setPendingCreate] = useState(null);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [dealFieldList, setDealFieldList] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Tab lives in the URL (?tab=Notes), so a refresh or a shared link lands
  // back on the same tab.
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
      // Carry location.state across, or the prev/next deal arrows lose the
      // list they were navigating.
      { replace: true, state: location.state },
    );
  };

  const dealLoaded = !!deal;

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
    const ro = new ResizeObserver(measure);
    if (tabTrackRef.current) ro.observe(tabTrackRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // `dealLoaded` because the page renders a skeleton until the deal arrives:
    // on the first pass the tab bar isn't mounted, so there is nothing to
    // measure and the indicator would stay stuck at width 0.
  }, [activeTab, dealLoaded]);

  const [showForm, setShowForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showStats, setShowStats] = useState(true);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showNewEntryMenu, setShowNewEntryMenu] = useState(false);
  const [showLastUpdatedTooltip, setShowLastUpdatedTooltip] = useState(false);
  const actionsMenuRef = useRef(null);
  const newEntryRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target))
        setShowActionsMenu(false);
      if (newEntryRef.current && !newEntryRef.current.contains(e.target))
        setShowNewEntryMenu(false);
    };
    const onScroll = () => {
      setShowActionsMenu(false);
      setShowNewEntryMenu(false);
    };
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, []);

  const fetchInvoices = async () => {
    try {
      // Filtered by the database, so only this deal's invoices come back —
      // the list used to be the organization's whole set, narrowed here.
      const res = await API.get("/invoices", { params: { deal: dealId } });
      setInvoices(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load invoices:", err);
    } finally {
      setInvoicesLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      setError(null);
      // Only the deal itself is fatal: a failure loading the side data
      // shouldn't replace the whole page with an error screen.
      const [dealRes, fieldsRes, companiesRes, contactsRes] = await Promise.all([
        API.get(`/deals/${dealId}`),
        API.get("/deal-fields/latest").catch(() => ({ data: { fields: [] } })),
        API.get("/companies").catch(() => ({ data: { companies: [] } })),
        API.get("/contacts").catch(() => ({ data: { contacts: [] } })),
      ]);
      setDeal(dealRes.data);
      setDealFieldList(fieldsRes.data?.fields || []);
      setCompanies(companiesRes.data?.companies || companiesRes.data || []);
      setContacts(contactsRes.data?.contacts || contactsRes.data || []);
    } catch (err) {
      console.error("Failed to load deal details:", err);
      setError("Failed to load deal details. Please try again.");
    }
  };

  // Only the custom-field config, not the whole deal — cheap enough to
  // refetch right after the field drawer closes (see BasicDetails'
  // onFieldsChanged) instead of reloading everything fetchData() does.
  const refreshDealFields = async () => {
    try {
      const res = await API.get("/deal-fields/latest");
      setDealFieldList(res.data?.fields || []);
    } catch (err) {
      console.error("Failed to refresh deal fields:", err);
    }
  };

  useEffect(() => {
    // Reset so stepping to another deal shows the skeleton again rather than
    // leaving the previous deal on screen until the new fetch resolves.
    setDeal(null);
    setInvoices([]);
    setInvoicesLoading(true);
    setTasks([]);
    setMeetings([]);
    setStatsLoading(true);

    // Tasks and meetings back the KPI row. The tabs fetch their own copies for
    // their tables, so a failure on either side only costs the counts.
    const fetchStats = async () => {
      try {
        const [resTasks, resMeetings] = await Promise.all([
          API.get(`/tasks/deal/${dealId}`).catch(() => ({ data: [] })),
          API.get("/meetings", { params: { dealId } }).catch(() => ({ data: {} })),
        ]);
        setTasks(Array.isArray(resTasks.data) ? resTasks.data : []);
        const m = resMeetings.data?.meetings ?? resMeetings.data;
        setMeetings(Array.isArray(m) ? m : []);
      } finally {
        setStatsLoading(false);
      }
    };

    fetchData();
    fetchInvoices();
    fetchStats();
  }, [dealId]);

  const handleEdit = () => {
    // Edit via the shared QuickDealForm (same as create).
    setShowForm(true);
  };

  const handleDeleteDeal = async () => {
    setShowDeleteConfirm(false);
    try {
      await API.delete(`/deals/${dealId}`);
      toast.success("Deal deleted successfully");
      navigate("/deals");
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to delete deal");
      }
    }
  };

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

  const totalInvoiced = invoices.reduce((sum, i) => sum + (i.amount || 0), 0);
  const paidInvoiced = invoices
    .filter((i) => (i.status || "").toLowerCase() === "paid")
    .reduce((sum, i) => sum + (i.amount || 0), 0);
  // The company page reads these off a server-side summary endpoint; a deal
  // has no equivalent, so they're derived from its own invoices.
  const invoiceSummary = {
    totalAmount: totalInvoiced,
    totalInvoices: invoices.length,
    amountPaid: paidInvoiced,
    amountDue: totalInvoiced - paidInvoiced,
  };

  const upcomingTasksCount = tasks.filter((t) => t.status !== "Completed").length;
  const upcomingMeetingsCount = meetings.filter(
    (m) => m.scheduledAt && new Date(m.scheduledAt) >= new Date(),
  ).length;

  const statTiles = [
    {
      label: "Deal Value",
      value: `₹${formatNumberToIndian(deal?.amount || 0)}`,
      icon: IndianRupeeIcon,
    },
    {
      label: "Invoiced",
      value: `₹${formatNumberToIndian(totalInvoiced)}`,
      icon: Receipt,
    },
    {
      label: "Outstanding",
      value: `₹${formatNumberToIndian(invoiceSummary.amountDue)}`,
      icon: PdfIcon,
    },
    { label: "Invoices", value: invoices.length, icon: Receipt },
    { label: "Upcoming Tasks", value: upcomingTasksCount, icon: CheckSquare },
    { label: "Upcoming Meetings", value: upcomingMeetingsCount, icon: CalendarIcon },
  ];

  if (error && !deal) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center">
        <AlertCircle className="w-10 h-10 text-red-500 mb-4" />
        <p className="text-gray-600 mb-4">{error}</p>
        <button
          onClick={() => navigate("/deals")}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg"
        >
          Back to Deals
        </button>
      </div>
    );
  }

  if (!deal) {
    return <PageSkeleton variant="recordDetail" />;
  }

  const companyId = deal.company?._id || deal.company;

  return (
    <div className="min-h-screen bg-white -mt-6 -mx-4 sm:-mx-6 lg:-mx-8 pt-6 px-6">
      {showForm && (
        <QuickDealForm
          companies={companies}
          contacts={contacts}
          editDeal={deal}
          onDealUpdated={() => {
            fetchData();
            setShowForm(false);
          }}
          onRequestClose={() => setShowForm(false)}
        />
      )}

      <div className="mx-auto">
        {/* Header Section — same 48px band as the company/contact pages. */}
        <div className="flex items-center justify-between mb-2">
          {/* LEFT: Avatar + Title + Company */}
          <div className="flex items-center gap-3 min-w-0">
            {dealIds && (
              <button
                type="button"
                onClick={() => goToDeal(prevDealId)}
                disabled={!prevDealId}
                title="Previous deal"
                aria-label="Previous deal"
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-base font-semibold text-gray-900 truncate">
                  {deal.title}
                </h1>
                <StatusBadge status={deal.status} />
                {deal.company && (
                  <Link
                    to={`/companies/${companyId}`}
                    className="flex-shrink-0 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5 hover:bg-blue-100 transition-colors truncate max-w-[160px]"
                    title={`Deal for ${deal.company.name}`}
                  >
                    {deal.company.name}
                  </Link>
                )}
              </div>
              {deal ? (
                <p className="text-xs text-gray-500 truncate">
                  ₹{formatNumberToIndian(deal.amount || 0)}
                  {deal.contact?.name ? ` · ${deal.contact.name}` : ""}
                </p>
              ) : (
                <Skeleton width={100} height={11} />
              )}
            </div>

            {dealIds && (
              <button
                type="button"
                onClick={() => goToDeal(nextDealId)}
                disabled={!nextDealId}
                title="Next deal"
                aria-label="Next deal"
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* RIGHT: Owner + timestamps + actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Owner — the org user the deal is assigned to (Deal.user). A
                label, not a link: it's a staff user, not a CRM record. */}
            {deal.user ? (
              <button
                disabled
                title={`Owner: ${deal.user.name}`}
                className="hidden lg:flex w-8 h-8 items-center justify-center rounded-full border border-gray-200 text-gray-800"
              >
                <User size={16} strokeWidth={2} />
              </button>
            ) : (
              <button
                disabled
                title="No owner assigned"
                className="hidden lg:flex w-8 h-8 items-center justify-center rounded-full border border-gray-200 text-gray-300 cursor-not-allowed"
              >
                <User size={16} strokeWidth={2} />
              </button>
            )}

            {/* Last updated / created — hover for both timestamps. */}
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
              {showLastUpdatedTooltip && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-50 text-left">
                  <div className="mb-2">
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                      Last updated
                    </p>
                    <p className="text-xs text-gray-800 mt-0.5">
                      {formatDateTime(deal.updatedAt)}
                      {deal.lastUpdatedBy?.name ? ` by ${deal.lastUpdatedBy.name}` : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                      Created on
                    </p>
                    <p className="text-xs text-gray-800 mt-0.5">
                      {formatDateTime(deal.createdAt)}
                      {deal.createdBy?.name ? ` by ${deal.createdBy.name}` : ""}
                    </p>
                  </div>
                </div>
              )}
            </div>

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
                  {deal.company && (
                    <Link
                      to={`/companies/${companyId}`}
                      onClick={() => setShowActionsMenu(false)}
                      className="flex items-center gap-1.5 lg:gap-2 w-full px-2 lg:px-3 py-1.5 lg:py-2 text-xs lg:text-sm font-normal text-gray-700 hover:bg-gray-50 text-left"
                    >
                      <Building2 size={12} className="text-gray-400 lg:hidden" />
                      <Building2 size={14} className="text-gray-400 hidden lg:block" />
                      View Company
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(true);
                      setShowActionsMenu(false);
                    }}
                    className="flex items-center gap-1.5 lg:gap-2 w-full px-2 lg:px-3 py-1.5 lg:py-2 text-xs lg:text-sm font-normal text-red-600 hover:bg-red-50 text-left"
                  >
                    <DeleteIcon style={{ width: 12, height: 12 }} className="text-red-400 lg:hidden" />
                    <DeleteIcon style={{ width: 14, height: 14 }} className="text-red-400 hidden lg:block" />
                    Delete Deal
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
                  {newEntryOptions.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => {
                        setActiveTab(option.tab);
                        setPendingCreate(option.create || null);
                        setShowNewEntryMenu(false);
                      }}
                      className="flex items-center gap-1.5 lg:gap-2 w-full px-2 lg:px-3 py-1.5 lg:py-2 text-xs lg:text-sm font-normal text-gray-700 hover:bg-gray-50 text-left"
                    >
                      <option.icon style={{ width: 12, height: 12 }} className="text-gray-400 lg:hidden" />
                      <option.icon style={{ width: 14, height: 14 }} className="text-gray-400 hidden lg:block" />
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              title="Edit"
              onClick={handleEdit}
              className="hidden lg:flex items-center gap-1.5 px-4 h-8 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-full transition-colors"
            >
              <EditIcon size={13} />
              Edit
            </button>
          </div>
        </div>

        {/* Separator */}
        <div className="border-b border-gray-200 mb-4 -mx-6"></div>

        {/* Tab Row: pill tab selector */}
        <div className="flex items-center justify-between mb-4 gap-3">
          <div
            ref={tabTrackRef}
            className="relative inline-flex items-center gap-1.5 h-10 p-1 bg-[#F1F1F5] rounded-full overflow-x-auto overflow-y-hidden no-scrollbar"
          >
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

        {/* Summary Stats Row — on Overview, mirroring the company page's
            Overview-only KPI strip. */}
        {showStats && activeTab === "Overview" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            {statsLoading || invoicesLoading
              ? Array.from({ length: 6 }).map((_, i) => <StatTileSkeleton key={i} />)
              : statTiles.map((tile) => <StatTile key={tile.label} tile={tile} />)}
          </div>
        )}

        {/* Tab Content */}
        <div className="min-h-[400px]">
          {activeTab === "Overview" && (
            <BasicDetails
              deal={deal}
              dealFieldList={dealFieldList}
              onDealUpdate={(updated) => (updated ? setDeal(updated) : fetchData())}
              onFieldsChanged={refreshDealFields}
            />
          )}
          {activeTab === "Invoices" && (
            <CompanyInvoicesTab
              invoices={invoices}
              summary={invoiceSummary}
              loading={invoicesLoading}
              showStats={showStats}
              deals={[deal]}
              refreshInvoices={fetchInvoices}
              autoOpenCreate={pendingCreate === "invoice"}
              onAutoOpenCreateConsumed={() => setPendingCreate(null)}
              companyId={companyId}
            />
          )}
          {activeTab === "Notes" && (
            <CompanyNotesTab
              dealId={dealId}
              companyId={companyId}
              showStats={showStats}
            />
          )}
          {activeTab === "Tasks" && (
            <CompanyTasksTab
              dealId={dealId}
              companyId={companyId}
              tasks={tasks}
              setTasks={setTasks}
              showStats={showStats}
              isLoading={statsLoading}
            />
          )}
          {activeTab === "Meetings" && (
            <CompanyMeetingsTab
              dealId={dealId}
              dealName={deal.title}
              companyId={companyId}
              companyName={deal.company?.name}
              meetings={meetings}
              setMeetings={setMeetings}
              showStats={showStats}
              isLoading={statsLoading}
            />
          )}
          {activeTab === "Calendar" && (
            <CompanyCalendar dealId={dealId} companyId={companyId} />
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete deal"
        message={`Are you sure you want to delete "${deal.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDeleteDeal}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <AppToaster />
    </div>
  );
}

export default DealDetail;
