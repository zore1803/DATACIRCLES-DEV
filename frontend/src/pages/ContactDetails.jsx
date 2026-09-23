import CalendarIcon from "../components/common/CalendarIcon";
import DeleteIcon from "../components/common/DeleteIcon";
import AddCallIcon from "../components/common/AddCallIcon";
import PlusIcon from "../components/common/PlusIcon";
import MoreIcon from "../components/common/MoreIcon";
import React, { useEffect, useState, useRef, useLayoutEffect } from "react";
import { useParams, Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import API from "../services/api";
import BasicDetails from "../components/contact/BasicDetails";
import CompanyNotesTab from "../components/company/CompanyNotesTab";
import CompanyCallLogsTab from "../components/company/CompanyCallLogsTab";
import CompanyCalendar from "../components/company/CompanyCalendar";
import CompanyMeetingsTab from "../components/company/CompanyMeetingsTab";
import CompanyTasksTab from "../components/company/CompanyTasksTab";
import ProfilePicture from "../components/contact/ProfilePicture";
import QuickDealForm from "../components/deal/QuickDealForm";
import ContactMeetingForm from "../components/contact/ContactMeetingForm";
import ConfirmDialog from "../components/common/ConfirmDialog";
import twitterLogo from "../assets/twitter-logo.png";
import linkedinLogo from "../assets/linkedin-logo.png";
import instagramLogo from "../assets/insta-logo.png";
import {
  MapPin,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  BriefcaseBusiness,
  CheckSquare,
  StickyNote,
  CopyPlus,
  Clock,
  Target,
} from "lucide-react";
import QuickContactForm from "../components/contact/QuickContactForm";
import toast from "react-hot-toast";
import AppToaster from "../components/AppToaster";
import useContactStore from "../store/useContactStore";
import MergeContactModal from "../components/contact/MergeContactModal";
import StatTile from "../components/common/StatTile";
import ContactSummaryCard from "../components/contact/ContactSummaryCard";
import StatTileSkeleton from "../components/common/StatTileSkeleton";
import Skeleton from "../components/common/Skeleton";
import PageSkeleton from "../components/common/PageSkeleton";
import EyeIcon from "../components/common/EyeIcon";
import EditIcon from "../components/common/EditIcon";

// The contact page mirrors CompanyProfilePage's shape (header strip, one pill
// tab bar, KPI row, full-width tab bodies) so moving between a company and one
// of its contacts doesn't change how the page works. The tab set is the
// contact's own — a contact has no sub-contacts, invoices or folders of its
// own, so those company tabs have no counterpart here.
const tabs = ["Overview", "Call Logs", "Notes", "Tasks", "Meetings", "Calendar"];

const newEntryOptions = [
  { label: "New Deal", icon: BriefcaseBusiness, create: "deal" },
  { label: "New Notes", icon: StickyNote, tab: "Notes" },
  { label: "New Task", icon: CheckSquare, tab: "Tasks" },
  { label: "New Meetings", icon: CalendarIcon, create: "meeting" },
  { label: "New Call Log", icon: AddCallIcon, tab: "Call Logs" },
];

const ContactDetailsPage = () => {
  const { id } = useParams(); // contact ID
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [contact, setContact] = useState(null);
  const [company, setCompany] = useState(null);
  const [deals, setDeals] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [callLogs, setCallLogs] = useState([]);
  const [callLogsLoading, setCallLogsLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);

  // Tab lives in the URL (?tab=Notes) exactly as on the company page, so a
  // refresh or a shared link lands back on the same tab.
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
      // Carry location.state across, or the prev/next contact arrows lose the
      // list they were navigating.
      { replace: true, state: location.state },
    );
  };

  const contactLoaded = !!contact;

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
    // Skeleton-to-real-content swaps change tab widths without activeTab
    // changing, so watch the whole track rather than only re-measuring on tab
    // switches — otherwise the pill strands itself wherever it first measured.
    const ro = new ResizeObserver(measure);
    if (tabTrackRef.current) ro.observe(tabTrackRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // `contactLoaded` matters because this page returns a full-page skeleton
    // until the contact arrives: on the first pass the tab bar isn't mounted,
    // so there is nothing to measure and nothing for the observer to watch.
    // activeTab doesn't change when the real page appears, so without this the
    // effect never re-ran and the indicator stayed at width 0 — no pill.
  }, [activeTab, contactLoaded]);

  const { currentContactIds } = useContactStore();

  const [showForm, setShowForm] = useState(false);
  const [allCompanies, setAllCompanies] = useState([]); // for the edit form's company dropdown
  const [contactFieldList, setContactFieldList] = useState([]);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showDealForm, setShowDealForm] = useState(false);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showStats, setShowStats] = useState(true);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showNewEntryMenu, setShowNewEntryMenu] = useState(false);
  const [showLastUpdatedTooltip, setShowLastUpdatedTooltip] = useState(false);
  const actionsMenuRef = useRef(null);
  const newEntryRef = useRef(null);

  // Close the header dropdowns on an outside click, same as the company page.
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

  const currentIndex = currentContactIds.indexOf(id);
  const hasPrev = currentIndex > 0;
  const hasNext =
    currentIndex !== -1 && currentIndex < currentContactIds.length - 1;

  const goToPrev = () => {
    if (hasPrev) navigate(`/contacts/${currentContactIds[currentIndex - 1]}`);
  };

  const goToNext = () => {
    if (hasNext) navigate(`/contacts/${currentContactIds[currentIndex + 1]}`);
  };

  const fetchContactDetails = async () => {
    try {
      const resContact = await API.get(`/contacts/${id}`);
      setContact(resContact.data);

      if (resContact.data.company) {
        const resCompany = await API.get(
          `/companies/${resContact.data.company._id}`,
        );
        setCompany(resCompany.data);
      }
    } catch (err) {
      console.error("Failed to load contact profile:", err);
      toast.error("Failed to load contact profile.");
    }
  };

  // Only the custom-field config, not the whole contact — cheap enough to
  // refetch right after the field drawer closes (see BasicDetails'
  // onFieldsChanged) instead of reloading everything fetchData() does.
  const refreshContactFields = async () => {
    try {
      const res = await API.get("/contact-fields/latest");
      setContactFieldList(res.data?.fields || []);
    } catch (err) {
      console.error("Failed to refresh contact fields:", err);
    }
  };

  useEffect(() => {
    // Reset so switching contacts (e.g. via the prev/next arrows) shows the
    // loading skeleton again instead of leaving the previous contact's data
    // on screen until the new fetch resolves.
    setContact(null);
    setCompany(null);
    setDeals([]);
    setTasks([]);
    setMeetings([]);
    setCallLogs([]);
    setCallLogsLoading(true);
    setStatsLoading(true);

    const fetchData = async () => {
      await fetchContactDetails();
      try {
        const resDeals = await API.get("/deals/");
        setDeals(resDeals.data.filter((deal) => deal?.contact?._id == id));

        const resCompanies = await API.get("/companies");
        setAllCompanies(resCompanies.data.companies || resCompanies.data);

        // Use /latest to get the organization's master template, not just the
        // current user's copy.
        const resFields = await API.get("/contact-fields/latest");
        setContactFieldList(resFields.data?.fields || []);
      } catch (err) {
        console.error("Failed to load contact profile:", err);
      }
    };// onFieldsChanged) instead of reloading everything fetchData() does.


    // Tasks and meetings back the KPI row here. The Tasks/Meetings tabs fetch
    // their own copies for their tables, so a failure on either side only
    // costs the counts, not the tab.
    const fetchStats = async () => {
      try {
        const [resTasks, resMeetings] = await Promise.all([
          API.get(`/tasks/contact/${id}`).catch(() => ({ data: [] })),
          API.get("/meetings", { params: { contactId: id } }).catch(() => ({
            data: {},
          })),
        ]);
        setTasks(Array.isArray(resTasks.data) ? resTasks.data : []);
        const m = resMeetings.data?.meetings ?? resMeetings.data;
        setMeetings(Array.isArray(m) ? m : []);
      } finally {
        setStatsLoading(false);
      }
    };

    // The Call Logs tab is the shared company component, and that one takes
    // its rows from the page rather than fetching its own — same arrangement
    // as CompanyProfilePage.
    const fetchCallLogs = async () => {
      try {
        const res = await API.get(`/call-logs/contact/${id}`);
        setCallLogs(res.data || []);
      } catch (err) {
        console.error("Failed to load call logs:", err);
      } finally {
        setCallLogsLoading(false);
      }
    };

    fetchData();
    fetchStats();
    fetchCallLogs();
  }, [id]);

  const handleEdit = () => {
    // Edit via the shared QuickContactForm (same as create).
    setShowForm(true);
  };

  const handleDealCreated = (newDeal) => {
    setDeals((prev) => [newDeal, ...prev]);
    toast.success("Deal created successfully!");
    setShowDealForm(false);
  };

  const handleContactUpdate = (updatedContact) => {
    setContact(updatedContact);
  };

  const handleMeetingSave = async (form) => {
    const loadingToast = toast.loading("Saving meeting...");
    try {
      await API.post("/meetings", {
        ...form,
        contactId: id,
        linkedTo: "contact",
      });
      toast.success("Meeting saved", { id: loadingToast });
      setShowMeetingForm(false);
    } catch {
      toast.error("Failed to save meeting", { id: loadingToast });
    }
  };

  const handleDeleteContact = async () => {
    setShowDeleteConfirm(false);
    try {
      await API.delete(`/contacts/${id}`);
      toast.success("Contact deleted successfully");
      navigate("/contacts");
    } catch (err) {
      console.error("Failed to delete contact:", err);
      toast.error(err.response?.data?.error || "Failed to delete contact");
    }
  };

  const hasSocialLink = (platform) =>
    contact?.socialMedia?.[platform] &&
    contact.socialMedia[platform].trim() !== "";

  const openSocialLink = (platform) => {
    const urlOrNumber = contact?.socialMedia?.[platform];
    if (urlOrNumber && urlOrNumber.trim() !== "") {
      if (platform === "whatsapp") {
        // Strip out non-numeric characters (except '+') for the WhatsApp API
        const cleanNumber = urlOrNumber.replace(/[^\d+]/g, "");
        const senderName = JSON.parse(localStorage.getItem("user") || "{}").name || "";
        const opener = `Hello ${contact?.name || ""}, this is ${senderName}.`.replace(/\s+/g, " ").trim();
        window.open(
          `https://wa.me/${cleanNumber}?text=${encodeURIComponent(opener)}`,
          "_blank",
          "noopener,noreferrer",
        );
      } else {
        window.open(urlOrNumber, "_blank", "noopener,noreferrer");
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

  const openDealsCount = deals.filter((d) => d.status === "Open").length;
  const closedDealsCount = deals.filter(
    (d) => d.status === "Won" || d.status === "Lost",
  ).length;
  const upcomingTasksCount = tasks.filter((t) => t.status !== "Completed").length;
  const upcomingMeetingsCount = meetings.filter(
    (m) => m.scheduledAt && new Date(m.scheduledAt) >= new Date(),
  ).length;
  const dealValue = deals.reduce((sum, d) => sum + (d.amount || 0), 0);

  // The company page's tiles are revenue-led (invoices belong to a company,
  // not a contact), so these are the contact-level equivalents.
  const statTiles = [
    {
      label: "Deal Value",
      value: `₹${dealValue.toLocaleString("en-IN")}`,
      icon: BriefcaseBusiness,
    },
    { label: "Open Deals", value: openDealsCount, icon: BriefcaseBusiness },
    { label: "Closed Deals", value: closedDealsCount, icon: CheckSquare },
    { label: "Upcoming Tasks", value: upcomingTasksCount, icon: CheckSquare },
    { label: "Upcoming Meetings", value: upcomingMeetingsCount, icon: CalendarIcon },
    {
      label: "Lifecycle Stage",
      value: contact?.lifecycleStage || "—",
      icon: Target,
    },
  ];

  if (!contact) {
    return (
      <PageSkeleton
        variant="recordDetail"
        tabWidths={[80, 100, 76, 72, 96, 92]}
      />
    );
  }

  return (
    <div className="min-h-screen bg-white -mt-6 -mx-4 sm:-mx-6 lg:-mx-8 pt-6 px-6">
      {showForm && (
        <QuickContactForm
          companies={allCompanies}
          editContact={contact}
          onContactUpdated={() => {
            fetchContactDetails();
            setShowForm(false);
          }}
          onRequestClose={() => setShowForm(false)}
        />
      )}

      <div className="mx-auto">
        {/* Header Section — 48px total (40px content + mb-2) so the strip's
            bottom edge lands on the same line as the sidebar switcher's
            bottom border, matching the company page. */}
        <div className="flex items-center justify-between mb-2">
          {/* LEFT: Avatar + Name + Company/Address */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Prev/next through whatever contact list (search/filter results)
                the user arrived from — absent on a direct link. */}
            {currentContactIds.length > 0 && (
              <button
                type="button"
                onClick={goToPrev}
                disabled={!hasPrev}
                title="Previous contact"
                aria-label="Previous contact"
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}

            <ProfilePicture
              contact={contact}
              size="w-9 h-9"
              textSize="text-sm"
            />

            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-base font-semibold text-gray-900 truncate">
                  {contact.name}
                </h1>
                {company && (
                  <Link
                    to={`/companies/${company._id}`}
                    className="flex-shrink-0 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5 hover:bg-blue-100 transition-colors truncate max-w-[160px]"
                    title={`Contact at ${company.name}`}
                  >
                    {company.name}
                  </Link>
                )}
              </div>
              {contact.email ? (
                <p className="text-xs text-gray-500 truncate">{contact.email}</p>
              ) : (
                <Skeleton width={100} height={11} />
              )}
            </div>

            {currentContactIds.length > 0 && (
              <button
                type="button"
                onClick={goToNext}
                disabled={!hasNext}
                title="Next contact"
                aria-label="Next contact"
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* RIGHT: Social icons (desktop) + actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
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
                      {formatDateTime(contact.updatedAt)}
                      {contact.lastUpdatedBy?.name
                        ? ` by ${contact.lastUpdatedBy.name}`
                        : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                      Created on
                    </p>
                    <p className="text-xs text-gray-800 mt-0.5">
                      {formatDateTime(contact.createdAt)}
                      {contact.createdBy?.name
                        ? ` by ${contact.createdBy.name}`
                        : ""}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Twitter/X */}
            <button
              disabled={!hasSocialLink("twitter")}
              className={`hidden lg:flex w-8 h-8 items-center justify-center rounded-full overflow-hidden transition-opacity ${hasSocialLink("twitter")
                ? "cursor-pointer"
                : "opacity-40 cursor-not-allowed"
                }`}
              onClick={() => openSocialLink("twitter")}
              title={
                hasSocialLink("twitter")
                  ? "View Twitter/X profile"
                  : "No Twitter/X link available"
              }
            >
              <img
                src={twitterLogo}
                alt=""
                className="w-8 h-8 object-contain"
                style={{ transform: "scale(1.4)" }}
              />
            </button>

            {/* LinkedIn */}
            <button
              disabled={!hasSocialLink("linkedin")}
              className={`hidden lg:flex w-8 h-8 items-center justify-center rounded-full overflow-hidden transition-opacity ${hasSocialLink("linkedin")
                ? "cursor-pointer"
                : "opacity-40 cursor-not-allowed"
                }`}
              onClick={() => openSocialLink("linkedin")}
              title={
                hasSocialLink("linkedin")
                  ? "View LinkedIn profile"
                  : "No LinkedIn link available"
              }
            >
              <img
                src={linkedinLogo}
                alt=""
                className="w-8 h-8 object-contain"
                style={{ transform: "scale(1.5)" }}
              />
            </button>

            {/* Instagram */}
            <button
              disabled={!hasSocialLink("instagram")}
              className={`hidden lg:flex w-8 h-8 items-center justify-center rounded-full overflow-hidden transition-opacity ${hasSocialLink("instagram")
                ? "cursor-pointer"
                : "opacity-40 cursor-not-allowed"
                }`}
              onClick={() => openSocialLink("instagram")}
              title={
                hasSocialLink("instagram")
                  ? "View Instagram profile"
                  : "No Instagram link available"
              }
            >
              <img
                src={instagramLogo}
                alt=""
                className="w-8 h-8 object-contain"
                style={{ transform: "scale(1.5)" }}
              />
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
                  <button
                    onClick={() => {
                      setShowMergeModal(true);
                      setShowActionsMenu(false);
                    }}
                    className="flex items-center gap-1.5 lg:gap-2 w-full px-2 lg:px-3 py-1.5 lg:py-2 text-xs lg:text-sm font-normal text-gray-700 hover:bg-gray-50 text-left"
                  >
                    <CopyPlus size={12} className="text-gray-400 lg:hidden" />
                    <CopyPlus size={14} className="text-gray-400 hidden lg:block" />
                    Merge Contact
                  </button>
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(true);
                      setShowActionsMenu(false);
                    }}
                    className="flex items-center gap-1.5 lg:gap-2 w-full px-2 lg:px-3 py-1.5 lg:py-2 text-xs lg:text-sm font-normal text-red-600 hover:bg-red-50 text-left"
                  >
                    <DeleteIcon style={{ width: 12, height: 12 }} className="text-red-400 lg:hidden" />
                    <DeleteIcon style={{ width: 14, height: 14 }} className="text-red-400 hidden lg:block" />
                    Delete Contact
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
                        // Deals and meetings open their own modal from here
                        // (the contact page owns those forms); the rest just
                        // switch to the tab that hosts the record's own
                        // "add" control.
                        if (option.create === "deal") setShowDealForm(true);
                        else if (option.create === "meeting") setShowMeetingForm(true);
                        else if (option.tab) setActiveTab(option.tab);
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
              className="hidden lg:flex items-center gap-1.5 px-4 h-8 text-sm font-medium text-white bg-[#0085FF] hover:bg-blue-600 rounded-full transition-colors"
            >
              <EditIcon size={13} />
              Edit
            </button>
          </div>
        </div>

        {/* Social Icons — mobile only, shown below the name, left-aligned
            under the name text (past the avatar), not the avatar itself */}
        <div className="flex lg:hidden items-center gap-1.5 mb-3 ml-12">
          <button
            disabled={!hasSocialLink("twitter")}
            className={`w-6 h-6 flex items-center justify-center rounded-full overflow-hidden transition-opacity ${hasSocialLink("twitter")
              ? "cursor-pointer"
              : "opacity-40 cursor-not-allowed"
              }`}
            onClick={() => openSocialLink("twitter")}
            title={
              hasSocialLink("twitter")
                ? "View Twitter/X profile"
                : "No Twitter/X link available"
            }
          >
            <img
              src={twitterLogo}
              alt=""
              className="w-6 h-6 object-contain"
              style={{ transform: "scale(1.4)" }}
            />
          </button>
          <button
            disabled={!hasSocialLink("linkedin")}
            className={`w-6 h-6 flex items-center justify-center rounded-full overflow-hidden transition-opacity ${hasSocialLink("linkedin")
              ? "cursor-pointer"
              : "opacity-40 cursor-not-allowed"
              }`}
            onClick={() => openSocialLink("linkedin")}
            title={
              hasSocialLink("linkedin")
                ? "View LinkedIn profile"
                : "No LinkedIn link available"
            }
          >
            <img
              src={linkedinLogo}
              alt=""
              className="w-6 h-6 object-contain"
              style={{ transform: "scale(1.5)" }}
            />
          </button>
          <button
            disabled={!hasSocialLink("instagram")}
            className={`w-6 h-6 flex items-center justify-center rounded-full overflow-hidden transition-opacity ${hasSocialLink("instagram")
              ? "cursor-pointer"
              : "opacity-40 cursor-not-allowed"
              }`}
            onClick={() => openSocialLink("instagram")}
            title={
              hasSocialLink("instagram")
                ? "View Instagram profile"
                : "No Instagram link available"
            }
          >
            <img
              src={instagramLogo}
              alt=""
              className="w-6 h-6 object-contain"
              style={{ transform: "scale(1.5)" }}
            />
          </button>
        </div>

        {/* Location */}
        {contact?.address && (
          <div className="flex items-center gap-2 text-gray-600 mb-3">
            <MapPin size={16} className="text-gray-400" />
            <span className="text-xs">{contact.address}</span>
          </div>
        )}

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

        {/* Contact Summary (collapsible) + KPI Row — mirrors the company
            page's Overview strip. */}
        {showStats && activeTab === "Overview" && (
          <>
            {!statsLoading && <ContactSummaryCard contact={contact} />}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
              {statsLoading
                ? Array.from({ length: 6 }).map((_, i) => <StatTileSkeleton key={i} />)
                : statTiles.map((tile) => <StatTile key={tile.label} tile={tile} />)}
            </div>
          </>
        )}

        {/* Tab Content */}
        <div className="min-h-[400px]">
          {activeTab === "Overview" && (
            <BasicDetails
              contact={contact}
              company={company}
              deals={deals}
              contactFieldList={contactFieldList}
              onContactUpdate={handleContactUpdate}
              onDealCreated={handleDealCreated}
              onFieldsChanged={refreshContactFields}
            />
          )}
          {activeTab === "Call Logs" && (
            <div className="animate-in fade-in duration-300">
              <CompanyCallLogsTab
                contactId={id}
                callLogs={callLogs}
                setCallLogs={setCallLogs}
                showStats={showStats}
                isLoading={callLogsLoading}
              />
            </div>
          )}
          {activeTab === "Notes" && (
            <CompanyNotesTab
              contactId={id}
              companyId={company?._id}
              showStats={showStats}
            />
          )}
          {activeTab === "Tasks" && (
            <CompanyTasksTab
              contactId={id}
              companyId={company?._id}
              tasks={tasks}
              setTasks={setTasks}
              showStats={showStats}
              isLoading={statsLoading}
            />
          )}
          {activeTab === "Meetings" && (
            <CompanyMeetingsTab
              contactId={id}
              contactName={contact.name}
              companyId={company?._id}
              companyName={company?.name}
              meetings={meetings}
              setMeetings={setMeetings}
              showStats={showStats}
              isLoading={statsLoading}
            />
          )}
          {activeTab === "Calendar" && (
            <CompanyCalendar contactId={id} companyId={company?._id} />
          )}
        </div>
      </div>

      {showDealForm && (
        <QuickDealForm
          companies={company ? [company] : []}
          contacts={contact ? [contact] : []}
          initialCompanyId={company?._id || ""}
          onDealCreated={handleDealCreated}
          onRequestClose={() => setShowDealForm(false)}
        />
      )}

      {showMeetingForm && (
        <ContactMeetingForm
          open={showMeetingForm}
          mode="create"
          contactId={id}
          onSave={handleMeetingSave}
          onClose={() => setShowMeetingForm(false)}
        />
      )}

      <MergeContactModal
        primaryContact={contact}
        isOpen={showMergeModal}
        onClose={() => setShowMergeModal(false)}
        onSuccess={() => {
          fetchContactDetails();
        }}
      />

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete contact"
        message="Are you sure you want to delete this contact? This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDeleteContact}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <AppToaster />
    </div>
  );
};

export default ContactDetailsPage;
