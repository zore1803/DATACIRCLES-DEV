import CalendarClockIcon from "../components/common/CalendarClockIcon";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Building,
  Users,
  CreditCard,
  Layout,
  Briefcase,
  Contact,
  Database,
  Calculator,
  ArrowLeft,
  HelpCircle,
  Workflow,
  Mail,
  ChevronRight,
  Sparkles,
  Zap,
  Shield,
  Globe,
  ExternalLink,
  ListChecks,
} from "lucide-react";
import SettingsIcon from "../components/common/SettingsIcon";
import KanbanSettings from "../components/settings/KanbanSettings";
import CompanyFieldSettings from "../components/settings/CompanyFieldSettings";
import AccountingFieldSettings from "../components/settings/AccountingFieldSettings";
import ContactFieldSettings from "../components/settings/ContactFieldSettings";
import DealFieldSettings from "../components/settings/DealFieldSettings";
import HelpCenter from "../components/settings/HelpCenter";
import VendorFieldSettings from "../components/settings/VendorFieldSettings";
import TaskFieldSettings from "../components/settings/TaskFieldSettings";
import MeetingFieldSettings from "../components/settings/MeetingFieldSettings";
import EmailNotifications from "../components/settings/EmailNotifications";
import logo from "/DataCircles.png";

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

const BasicSettings = () => {
  const navigate = useNavigate();
  const params = useParams();
  const [activeSection, setActiveSection] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    if (!storedUser) {
      navigate("/login");
      return;
    }

    // Simulate loading settings data
    const loadSettings = async () => {
      try {
        setLoading(true);
        // Simulate API call or data loading
        await new Promise((resolve) => setTimeout(resolve, 800));

        // Determine active section from URL params
        const sectionId = params.section;
        if (sectionId) {
          const selectedItem = settingsItems.find(
            (item) => item.id === sectionId
          );
          if (selectedItem) {
            setActiveSection(selectedItem);
          } else {
            navigate("/settings");
          }
        } else {
          setActiveSection(null);
        }
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [navigate, params.section]);

  const settingsItems = [
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
      id: "accounting-fields",
      icon: <Calculator className="w-5 h-5" />,
      label: "Accounting Fields",
      description: "Customize fields for invoices, pro forma, quotations and challans",
      color: "text-emerald-600",
      bgColor: "bg-emerald-50",
      borderColor: "border-emerald-200",
      hoverBg: "hover:bg-emerald-50",
      component: <AccountingFieldSettings />,
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
      category: "Support",
    },
  ];

  const handleItemClick = (item) => {
    if (item.id === "help-center") {
      window.open("https://help.datacircles.in/en", "_blank");
    } else {
      navigate(`/settings/${item.id}`);
    }
  };

  const goBack = () => {
    navigate("/settings");
  };

  // Group settings by category
  const groupedSettings = settingsItems.reduce((acc, item) => {
    const category = item.category || "Other";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {});

  const categoryOrder = ["General", "Customization", "Support"];

  const categoryIcons = {
    General: <SettingsIcon className="w-4 h-4" />,
    Customization: <Zap className="w-5 h-5" />,
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
    // Matches the admin Settings page's fixed toolbar-strip pattern (Settings.jsx)
    // — flat white background, no outer gutters, title strip aligned with the
    // sidebar switcher — instead of the old gray-gradient/breadcrumb-card layout.
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
            <div className={`p-2 rounded-lg ${activeSection.bgColor} ${activeSection.color} flex-shrink-0`}>
              {activeSection.icon}
            </div>
            <div className="min-w-0">
              <h1 className="m-0 leading-tight font-bold text-base sm:text-lg text-gray-900 truncate">
                {activeSection.label}
              </h1>
              <p className="m-0 leading-tight text-[10px] sm:text-xs text-gray-500 truncate">
                {activeSection.description}
              </p>
            </div>
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
      {/* Fixed page-header strip — matches the sub-page strip pattern */}
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
          {/* Same action as the admin Settings header - that slot held a
              static "Staff Panel" label, which named the page you were
              already on rather than doing anything. */}
          <button
            onClick={() => window.open("https://help.datacircles.in/en", "_blank")}
            className="hidden md:flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors group flex-shrink-0"
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
                  <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-2 rounded-lg shadow-md">
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

export default BasicSettings;
import PageSkeleton from "../components/common/PageSkeleton";
