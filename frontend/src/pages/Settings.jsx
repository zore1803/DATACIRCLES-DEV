import CalendarClockIcon from "../components/common/CalendarClockIcon";
import PdfIcon from "../components/common/PdfIcon";
import { useEffect, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import API from "../services/api";
import {
  Building,
  User,
  CreditCard,
  Layout,
  Briefcase,
  Contact,
  Database,
  ArrowLeft,
  HelpCircle,
  Workflow,
  Package,
  Mail,
  Crown,
  ChevronRight,
  Zap,
  Bell,
  Globe,
  ExternalLink,
  Receipt,
  Gift,
  Wallet as WalletIcon,
  ListChecks,
} from "lucide-react";
import SettingsIcon from "../components/common/SettingsIcon";

const OrgIcon = ({ className }) => (
  <svg viewBox="-2.22 -3.22 24.44 24.44" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M2 18C1.45 18 0.979167 17.8042 0.5875 17.4125C0.195833 17.0208 0 16.55 0 16V2C0 1.45 0.195833 0.979167 0.5875 0.5875C0.979167 0.195833 1.45 0 2 0H8C8.55 0 9.02083 0.195833 9.4125 0.5875C9.80417 0.979167 10 1.45 10 2V4H18C18.55 4 19.0208 4.19583 19.4125 4.5875C19.8042 4.97917 20 5.45 20 6V16C20 16.55 19.8042 17.0208 19.4125 17.4125C19.0208 17.8042 18.55 18 18 18H2ZM2 16H8V14H2V16ZM2 12H8V10H2V12ZM2 8H8V6H2V8ZM2 4H8V2H2V4ZM10 16H18V6H10V16ZM13 10C12.7167 10 12.4792 9.90417 12.2875 9.7125C12.0958 9.52083 12 9.28333 12 9C12 8.71667 12.0958 8.47917 12.2875 8.2875C12.4792 8.09583 12.7167 8 13 8H15C15.2833 8 15.5208 8.09583 15.7125 8.2875C15.9042 8.47917 16 8.71667 16 9C16 9.28333 15.9042 9.52083 15.7125 9.7125C15.5208 9.90417 15.2833 10 15 10H13ZM13 14C12.7167 14 12.4792 13.9042 12.2875 13.7125C12.0958 13.5208 12 13.2833 12 13C12 12.7167 12.0958 12.4792 12.2875 12.2875C12.4792 12.0958 12.7167 12 13 12H15C15.2833 12 15.5208 12.0958 15.7125 12.2875C15.9042 12.4792 16 12.7167 16 13C16 13.2833 15.9042 13.5208 15.7125 13.7125C15.5208 13.9042 15.2833 14 15 14H13Z" fill="currentColor" />
  </svg>
);
import { ContactsIcon } from "../components/Navbar";
import BankDetails from "../components/settings/BankDetails";
import Profile from "./Profile";
import BrandSettings from "../components/settings/BrandSettings";
import AddUser from "../components/settings/AddUser";
import KanbanSettings from "../components/settings/KanbanSettings";
import CompanyFieldSettings from "../components/settings/CompanyFieldSettings";
import ContactFieldSettings from "../components/settings/ContactFieldSettings";
import DealFieldSettings from "../components/settings/DealFieldSettings";
import HelpCenter from "../components/settings/HelpCenter";
import VendorFieldSettings from "../components/settings/VendorFieldSettings";
import ItemFieldSettings from "../components/settings/ItemFieldSettings";
import TaskFieldSettings from "../components/settings/TaskFieldSettings";
import MeetingFieldSettings from "../components/settings/MeetingFieldSettings";
import FormsList from "../components/settings/FormsList";
import EmailNotifications from "../components/settings/EmailNotifications";
import SubscriptionPlans from "../components/settings/SubscriptionPlans";
import BasicSettings from "./BasicSettings";
import logo from "/DataCircles.png";
import BillingCenter from "../components/settings/BillingCenter";
import Referrals from "../components/settings/Referrals";
import Wallet from "../components/settings/Wallet";
import UserManagement from "./UserManagement";
import DocumentSettings from "../components/settings/DocumentSettings";
import DataAdministration from "../components/settings/DataAdministration";
import SystemDefaultsSettings from "../components/settings/SystemDefaultsSettings";
import CustomDomain from "../components/settings/CustomDomain";
import GoogleIntegration, { GoogleGIcon } from "../components/settings/GoogleIntegration";
import PageSkeleton from "../components/common/PageSkeleton";
import TeamIcon from "../components/common/TeamIcon";

// Array of cool loading messages relevant for dashboard
const loadingMessages = [
  "Fetching your personalized CRM settings…",

  "Loading configuration modules — almost there!",

  "Preparing your workspace preferences…",

  "Syncing user permissions and settings…",

  "Optimizing your CRM environment…",

  "Just a moment — setting up your controls!",

  "Loading billing, branding, and customization tools…",

  "Bringing your settings dashboard to life…",

  "Fetching admin configurations securely…",

  "DataCircles is tuning your preferences for peak performance.",
];

// Select a random message
const randomMessage =
  loadingMessages[Math.floor(Math.random() * loadingMessages.length)];

const Settings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [activeSection, setActiveSection] = useState(null);
  const [loading, setLoading] = useState(true);

  // The Google OAuth callback redirects to /settings?googleMeet=... at the
  // root (see backend authController.googleCallback) rather than the
  // google-integration subsection, since that's the URL it can safely
  // hardcode. Forward there so the connected/denied/error state actually
  // renders somewhere that reads it.
  useEffect(() => {
    if (new URLSearchParams(location.search).has("googleMeet") && params.section !== "google-integration") {
      navigate(`/settings/google-integration${location.search}`, { replace: true });
    }
  }, [location.search, params.section, navigate]);

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    if (!storedUser) {
      navigate("/login");
      return;
    }

    // A sub-page (e.g. /settings/billing) resolves instantly from the
    // in-memory settingsItems list and fetches/skeletons its own data once
    // mounted (BankDetails, BillingCenter, Wallet, etc. each have their own
    // loading UI) — so it skips the simulated delay and generic tile-grid
    // skeleton below, which used to show first regardless of destination
    // and made every sub-page's initial load look identical to the
    // top-level Settings grid.
    const sectionId = params.section;
    if (sectionId) {
      const selectedItem = settingsItems.find((item) => item.id === sectionId);
      if (selectedItem) {
        setActiveSection(selectedItem);
      } else {
        navigate("/settings");
      }
      setLoading(false);
      return;
    }

    // Simulate loading settings data for the top-level grid only.
    const loadSettings = async () => {
      try {
        setLoading(true);
        // Simulate API call or data loading
        await new Promise((resolve) => setTimeout(resolve, 800));
        setActiveSection(null);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [navigate, params.section]);

  const settingsItems = [
    {
      id: "billing",
      icon: <Receipt className="w-5 h-5" />,
      label: "Billing",
      description: "Your subscription, timeline, invoices & payments in one place",
      color: "text-yellow-600",
      bgColor: "bg-yellow-50",
      borderColor: "border-yellow-200",
      hoverBg: "hover:bg-yellow-50",
      component: <BillingCenter />,
      category: "Billing",
      badge: "Premium",
      badgeColor: "bg-yellow-100 text-yellow-800",
    },
    {
      id: "subscription",
      icon: <Crown className="w-5 h-5" />,
      label: "Manage Subscription",
      description: "Change plan, add-ons, or billing cycle",
      color: "text-yellow-600",
      bgColor: "bg-yellow-50",
      borderColor: "border-yellow-200",
      hoverBg: "hover:bg-yellow-50",
      component: <SubscriptionPlans />,
      category: "Billing",
    },
    {
      id: "wallet",
      icon: <WalletIcon className="w-5 h-5" />,
      label: "Wallet",
      description: "Manage your credits and usage-based purchases",
      color: "text-emerald-600",
      bgColor: "bg-emerald-50",
      borderColor: "border-emerald-200",
      hoverBg: "hover:bg-emerald-50",
      component: <Wallet />,
      category: "Billing",
    },
    {
      id: "data-administration",
      icon: <Database className="w-5 h-5" />,
      label: "Data Administration",
      description: "See your storage consumption and buy add-ons or upgrade",
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
      hoverBg: "hover:bg-blue-50",
      component: <DataAdministration />,
      category: "Billing",
    },
    {
      id: "referrals",
      icon: <Gift className="w-5 h-5" />,
      label: "Referrals",
      description: "Invite others and track your referral rewards",
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      borderColor: "border-purple-200",
      hoverBg: "hover:bg-purple-50",
      component: <Referrals />,
      category: "Billing",
    },
    {
      id: "profile",
      icon: <ContactsIcon className="w-5 h-5" />,
      label: "User Profile",
      description: "Your account details, photo, and active sessions",
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
      hoverBg: "hover:bg-blue-50",
      component: <Profile />,
      category: "Profile",
    },
    {
      id: "users",
      icon: <TeamIcon className="w-5 h-5" />,
      label: "User Management",
      description: "Manage user accounts and permissions",
      color: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      hoverBg: "hover:bg-green-50",
      component: <UserManagement />,
      category: "Profile",
    },
    {
      id: "brand",
      icon: <OrgIcon className="w-5 h-5" />,
      label: "Organization Details",
      description: "Configure brand and account settings",
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
      hoverBg: "hover:bg-blue-50",
      component: <BrandSettings />,
      category: "Profile",
    },
    {
      id: "custom-domain",
      icon: <Globe className="w-5 h-5" />,
      label: "Custom Domain",
      description: "Use your own domain for public document links",
      color: "text-indigo-600",
      bgColor: "bg-indigo-50",
      borderColor: "border-indigo-200",
      hoverBg: "hover:bg-indigo-50",
      component: <CustomDomain />,
      category: "General",
    },
    {
      id: "bank",
      icon: <CreditCard className="w-5 h-5" />,
      label: "Banks",
      description: "Add and manage bank accounts for payments, UPI QR codes, and invoices",
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      borderColor: "border-purple-200",
      hoverBg: "hover:bg-purple-50",
      component: <BankDetails />,
      category: "Billing",
    },
    {
      id: "document-settings",
      icon: <PdfIcon className="w-4 h-4" />,
      label: "Document Settings",
      description: "Set invoice numbering defaults and document preferences",
      color: "text-sky-600",
      bgColor: "bg-sky-50",
      borderColor: "border-sky-200",
      hoverBg: "hover:bg-sky-50",
      component: <DocumentSettings />,
      category: "General",
    },
    {
      id: "kanban",
      icon: <Layout className="w-5 h-5" />,
      label: "Kanban Settings",
      description: "Configure kanban board layouts",
      color: "text-amber-600",
      bgColor: "bg-amber-50",
      borderColor: "border-amber-200",
      hoverBg: "hover:bg-amber-50",
      component: <KanbanSettings />,
      category: "Customization",
    },
    {
      id: "company-fields",
      icon: <Database className="w-5 h-5" />,
      label: "Company Fields",
      description: "Customize company data fields",
      color: "text-cyan-600",
      bgColor: "bg-cyan-50",
      borderColor: "border-cyan-200",
      hoverBg: "hover:bg-cyan-50",
      component: <CompanyFieldSettings />,
      category: "Customization",
    },
    {
      id: "contact-fields",
      icon: <Contact className="w-5 h-5" />,
      label: "Contact Fields",
      description: "Customize contact data fields",
      color: "text-indigo-600",
      bgColor: "bg-indigo-50",
      borderColor: "border-indigo-200",
      hoverBg: "hover:bg-indigo-50",
      component: <ContactFieldSettings />,
      category: "Customization",
    },
    {
      id: "deal-fields",
      icon: <Briefcase className="w-5 h-5" />,
      label: "Deal Fields",
      description: "Customize deal and opportunity fields",
      color: "text-orange-600",
      bgColor: "bg-orange-50",
      borderColor: "border-orange-200",
      hoverBg: "hover:bg-orange-50",
      component: <DealFieldSettings />,
      category: "Customization",
    },
    {
      id: "vendor-fields",
      icon: <Workflow className="w-5 h-5" />,
      label: "Vendor Fields",
      description: "Customize vendor data fields",
      color: "text-pink-600",
      bgColor: "bg-pink-50",
      borderColor: "border-pink-200",
      hoverBg: "hover:bg-pink-50",
      component: <VendorFieldSettings />,
      category: "Customization",
    },
    {
      id: "item-fields",
      icon: <Package className="w-5 h-5" />,
      label: "Item Fields",
      description: "Customize product and service fields",
      color: "text-teal-600",
      bgColor: "bg-teal-50",
      borderColor: "border-teal-200",
      hoverBg: "hover:bg-amber-50",
      component: <ItemFieldSettings />,
      category: "Customization",
    },
    {
      id: "task-fields",
      icon: <ListChecks className="w-5 h-5" />,
      label: "Task Fields",
      description: "Customize task data fields",
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
      hoverBg: "hover:bg-blue-50",
      component: <TaskFieldSettings />,
      category: "Customization",
    },
    {
      id: "meeting-fields",
      icon: <CalendarClockIcon className="w-5 h-5" />,
      label: "Meeting Fields",
      description: "Customize meeting data fields",
      color: "text-violet-600",
      bgColor: "bg-violet-50",
      borderColor: "border-violet-200",
      hoverBg: "hover:bg-violet-50",
      component: <MeetingFieldSettings />,
      category: "Customization",
    },
    {
      id: "system-defaults",
      icon: <SettingsIcon className="w-4 h-4" />,
      label: "System Defaults",
      description: "Manage custom task statuses and note types",
      color: "text-slate-600",
      bgColor: "bg-slate-50",
      borderColor: "border-slate-200",
      hoverBg: "hover:bg-slate-50",
      component: <SystemDefaultsSettings />,
      category: "Customization",
    },
    {
      id: "forms",
      icon: <PdfIcon className="w-4 h-4" />,
      label: "Forms",
      description: "Build and manage how customers enter your CRM",
      color: "text-emerald-600",
      bgColor: "bg-emerald-50",
      borderColor: "border-emerald-200",
      hoverBg: "hover:bg-emerald-50",
      component: <FormsList />,
      category: "Customization",
    },
    {
      id: "google-integration",
      icon: <GoogleGIcon className="w-5 h-5" />,
      label: "Google Calendar & Meet",
      description: "Connect Google to create Calendar events and Meet links from meetings",
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
      hoverBg: "hover:bg-blue-50",
      component: <GoogleIntegration />,
      category: "General",
    },
    {
      id: "email-notifications",
      icon: <Mail className="w-5 h-5" />,
      label: "Email Notifications",
      description: "Configure automatic email triggers",
      color: "text-teal-600",
      bgColor: "bg-teal-50",
      borderColor: "border-teal-200",
      hoverBg: "hover:bg-teal-50",
      component: <EmailNotifications />,
      category: "General",
    },
    {
      id: "help-center",
      icon: <HelpCircle className="w-5 h-5" />,
      label: "Help Center",
      description: "Browse help articles and FAQs",
      color: "text-cyan-600",
      bgColor: "bg-cyan-50",
      borderColor: "border-cyan-200",
      hoverBg: "hover:bg-cyan-50",
      component: <HelpCenter />,
      category: "General",
    },
  ];

  const handleItemClick = (item) => {
    if (item.id === "help-center") {
      window.open("https://help.datacircles.in/en", "_blank");
    } else {
      // Marks this as an in-Settings navigation so the sidebar keeps
      // "Settings" pilled instead of switching to "Forms" (which has its
      // own direct sidebar shortcut to the same /settings/forms route).
      navigate(`/settings/${item.id}`, { state: { viaSettingsNav: true } });
    }
  };

  const goBack = () => {
    navigate("/settings");
  };

  const storedUser = JSON.parse(localStorage.getItem("user"));
  if (storedUser?.role == "staff") {
    return <BasicSettings />;
  }

  // Group settings by category
  const groupedSettings = settingsItems.reduce((acc, item) => {
    const category = item.category || "Other";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {});

  const categoryOrder = [
    "Profile",
    "Billing",
    "General",
    "Team",
    "Customization",
    "Automation",
    "Support",
  ];

  const categoryIcons = {
    Profile: <ContactsIcon className="w-5 h-5" />,
    Billing: <CreditCard className="w-5 h-5" />,
    General: <SettingsIcon className="w-4 h-4" />,
    Team: <TeamIcon className="w-5 h-5" />,
    Customization: <Zap className="w-5 h-5" />,
    Automation: <Workflow className="w-5 h-5" />,
    Support: <HelpCircle className="w-5 h-5" />,
  };

  // Loading State
  if (loading) {
    return (
      <PageSkeleton
        variant="settings"
        groups={categoryOrder
          .map((c) => (groupedSettings[c] || []).length)
          .filter(Boolean)}
      />
    );
  }

  if (activeSection) {
    // Matches the Companies page's fixed toolbar-strip pattern instead of the
    // old gray-gradient/breadcrumb-card layout — flat white background, no
    // outer gutters, title strip aligned with the sidebar switcher.
    return (
      <div
        className="min-h-screen bg-white"
        style={{
          marginTop: -24,
          marginLeft: -32,
          marginRight: -32,
          boxSizing: "border-box",
        }}
      >
        <div
          className="fixed right-0 h-16 px-4 sm:px-6 lg:px-8 border-b border-[#E1E4EA] bg-white flex items-center top-[calc(54px+var(--dc-offline-offset,0px))] lg:top-[calc(64px+var(--dc-offline-offset,0px))]"
          style={{
            left: "var(--sidebar-width, 0px)",
            zIndex: 40,
            minHeight: "64px",
            maxHeight: "64px",
            boxSizing: "border-box",
          }}
        >
          <div className="flex items-center gap-4 w-full">
            <button
              onClick={goBack}
              className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="h-6 w-px bg-gray-200 flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="m-0 leading-tight font-bold text-base sm:text-lg text-gray-900 truncate">
                {activeSection.label}
              </h1>
              <p className="m-0 leading-tight text-[10px] sm:text-xs text-gray-500 truncate">
                {activeSection.description}
              </p>
            </div>
            {/* Portal target for a settings tab's own header-strip actions
                (e.g. SubscriptionPlans' "View Billing Calendar" link) — this
                shell is shared by every settings tab, so a child section
                can't render into it via normal composition. Empty for any
                tab that doesn't use it. */}
            <div id="settings-header-actions" className="ml-auto flex-shrink-0 flex items-center gap-3" />
          </div>
        </div>

        <div className="pt-[118px] lg:pt-[128px] px-4 sm:px-6 lg:px-8 pb-8">
          {activeSection.component}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white -mt-6 -mx-4 sm:-mx-6 lg:-mx-8">
      {/* Fixed page-header strip */}
      <div
        className="fixed right-0 h-16 px-4 sm:px-6 lg:px-8 border-b border-[#E1E4EA] bg-white flex items-center top-[calc(54px+var(--dc-offline-offset,0px))] lg:top-[calc(64px+var(--dc-offline-offset,0px))]"
        style={{
          left: "var(--sidebar-width, 0px)",
          zIndex: 40,
          minHeight: "64px",
          maxHeight: "64px",
          boxSizing: "border-box",
        }}
      >
        <div className="flex items-center justify-between w-full">
          <div className="flex flex-col justify-center gap-1.5">
            <h1 className="m-0 leading-tight font-bold text-base sm:text-lg text-gray-900 truncate">
              Settings
            </h1>
            <p className="m-0 leading-tight text-[10px] sm:text-xs text-gray-500 font-inter truncate">
              Customize and configure your CRM system
            </p>
          </div>
          {/* Sits where the Admin Panel badge used to - that was a static
              label, this is the one action the page's footer card carried. */}
          <button
            onClick={() => window.open("https://help.datacircles.in/en", "_blank")}
            className="hidden md:flex items-center gap-2 h-[38px] bg-blue-50 px-4 rounded-full border border-blue-200 hover:bg-blue-100 transition-colors group flex-shrink-0"
          >
            <Globe className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-semibold text-blue-700">
              Visit Help Center
            </span>
            <ChevronRight className="w-4 h-4 text-blue-600 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>

      <div className="pt-[118px] lg:pt-[128px] px-4 sm:px-6 lg:px-8 pb-8">
        {/* Settings by Category */}
        <div className="space-y-8">
          {categoryOrder.map((category) => {
            const items = groupedSettings[category];
            if (!items || items.length === 0) return null;

            return (
              <div key={category}>
                {/* Category Header */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="bg-[#0085FF] p-2 rounded-lg shadow-md">
                    <div className="text-white">
                      {categoryIcons[category] || (
                        <SettingsIcon className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {category}
                  </h2>
                  <div className="flex-1 h-px bg-gradient-to-r from-gray-300 to-transparent"></div>
                </div>

                {/* Settings entries - just the icon and the section name. No
                    card around them: the description and Configure footer the
                    old cards carried only repeated what each section says on
                    arrival, and once those were gone the box had nothing left
                    to hold. */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      title={item.description}
                      className="group relative flex flex-col items-center gap-2 p-3 transition-colors"
                    >
                      <div
                        className={`p-3 rounded-xl border border-[#E1E4EA] ${item.bgColor} ${item.color} group-hover:scale-110 transition-transform duration-200`}
                      >
                        {item.icon}
                      </div>
                      <span className="flex items-center justify-center gap-1 text-xs font-semibold text-gray-900 text-center leading-snug group-hover:text-blue-600 transition-colors">
                        {item.label}
                        {/* Marks Help Center as leaving the app. Inline after
                            the label rather than absolutely positioned: with
                            no card behind it, a corner marker floated in open
                            space away from the entry it belonged to. */}
                        {item.id === "help-center" && (
                          <ExternalLink className="w-3 h-3 flex-shrink-0 text-gray-400" />
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Enhanced Help Card */}
        <div className="mt-10">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl border-2 border-blue-500 shadow-xl p-8 relative overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full -translate-y-32 translate-x-32"></div>
              <div className="absolute bottom-0 left-0 w-96 h-96 bg-white rounded-full translate-y-48 -translate-x-48"></div>
            </div>

            <div className="relative flex flex-col md:flex-row items-start md:items-center gap-6">
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-white mb-2">
                  Need Help?
                </h3>
                <p className="text-blue-100 text-sm md:text-base leading-relaxed">
                  Our support team is here to assist you with any issues you may
                  have. Access our comprehensive help center for guides,
                  tutorials, and FAQs.
                </p>
              </div>
              <button
                onClick={() =>
                  window.open("https://help.datacircles.in/en", "_blank")
                }
                className="flex items-center gap-2 px-6 py-3 bg-white text-blue-600 rounded-xl hover:bg-blue-100 transition-all shadow-lg hover:shadow-xl font-semibold text-sm group"
              >
                <Globe className="w-5 h-5" />
                Visit Help Center
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
