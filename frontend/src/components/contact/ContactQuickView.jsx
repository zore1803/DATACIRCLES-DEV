import CalendarIcon from "../common/CalendarIcon";
import CellphoneIcon from "../common/CellphoneIcon";
// src/components/contact/ContactQuickView.jsx
import React, { useEffect, useState } from "react";
import API from "../../services/api";
import toast from "react-hot-toast";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Mail,
  Building2,
} from "lucide-react";
import BasicDetails from "./BasicDetails";
import NoteSection from "./NoteSection";
import CallLogs from "./CallLogs";
import Calendar from "./Calender";
import MeetingsTable from "./MeetingsTable";
import ContactTasksTable from "./ContactTasksTable";
import ProfilePicture from "./ProfilePicture";
import QuickContactForm from "./QuickContactForm";
import useContactStore from "../../store/useContactStore";
import { Link } from "react-router-dom";
import EditIcon from "../common/EditIcon";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

const tabsLeft = ["Details", "Call Logs"];
const tabsRight = ["Notes", "Tasks", "Meetings", "Calendar"];

const ContactQuickView = ({ contactId, onClose, onEdit }) => {
  const [contact, setContact] = useState(null);
  const [company, setCompany] = useState(null);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTabLeft, setActiveTabLeft] = useState("Details");
  const [activeTabRight, setActiveTabRight] = useState("Notes");
  const [isExpanded, setIsExpanded] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  // Drives the slide-in/out transform independently of `contact` (which
  // stays populated across prev/next navigation) so a real close can
  // animate the panel out before the parent unmounts it.
  const [isOpen, setIsOpen] = useState(false);

  useBodyScrollLock(!!contact || loading);

  const { currentContactIds } = useContactStore();

  const currentIndex = currentContactIds.indexOf(contactId);
  const hasPrev = currentIndex > 0;
  const hasNext =
    currentIndex !== -1 && currentIndex < currentContactIds.length - 1;

  const loadContact = async (id) => {
    setLoading(true);
    try {
      const res = await API.get(`/contacts/${id}`);
      setContact(res.data);

      if (res.data.company?._id) {
        const companyRes = await API.get(`/companies/${res.data.company._id}`);
        setCompany(companyRes.data);
      }

      const dealsRes = await API.get(`/deals?contact=${id}`);
      setDeals(dealsRes.data);

      setLoading(false);
    } catch (err) {
      toast.error("Failed to load contact details");
      setLoading(false);
      onClose();
    }
  };

  useEffect(() => {
    if (contactId) loadContact(contactId);
  }, [contactId]);

  // Slide in once the panel actually has data to show.
  useEffect(() => {
    if (contact) setIsOpen(true);
  }, [contact]);

  // Slide out first, then unmount — matches how it slides in instead of
  // vanishing instantly.
  const handleClose = () => {
    setIsOpen(false);
    setTimeout(onClose, 300);
  };

  const goToPrev = () =>
    hasPrev && loadContact(currentContactIds[currentIndex - 1]);
  const goToNext = () =>
    hasNext && loadContact(currentContactIds[currentIndex + 1]);

  if (!contact && !loading) return null;

  return (
    <>
      {/* Backdrop — dimmed/blurred on mobile, invisible but still present (and
          click-catching) on desktop so clicking outside the panel closes it
          there too instead of falling through to the page underneath. */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm lg:bg-transparent lg:backdrop-blur-none z-[9998]"
        onClick={handleClose}
      />

      {/* Slide-in Panel – improved responsive widths.
          dc-panel-card gives it the same rounded, inset-from-the-edges card
          look as the Edit Contact modal (dc-panel-card + dc-panel-w there
          too) — this was plain top-0/right-0/h-full before, flush to the
          viewport with square corners, which is why it looked like a
          different, flatter component next to Edit.
          Closed state MUST be translate-x-[calc(100%+2rem)], not plain
          translate-x-full — dc-panel-card sits right: 1.5rem inset from the
          edge, so translating by only the panel's own width leaves that
          1.5rem sliver still on-screen when "closed" (documented on
          .dc-panel-card in index.css; same fix already applied in
          ContactForm.jsx). */}
      <div
        className={`
          fixed dc-panel-card dc-panel-w
          bg-white shadow-2xl z-[9999]
          transform transition-transform duration-300 ease-in-out
          overflow-hidden
          flex flex-col
          ${isOpen ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}
        `}
      >
        {/* Header — was `sticky top-0` inside a content area sized by a
            hardcoded `h-[calc(100%-68px)]` guess at the header's height.
            Real header height varies (name length wrapping, prev/next arrows
            only showing when currentContactIds.length > 1), so that guess
            being off left too little gap between the header and whatever
            content follows it — the title/H1 name and the Deals card both
            sat almost flush against it. Now a normal (non-sticky) flex-column
            child: the panel itself is flex flex-col above, this is
            flex-shrink-0, and the content below is flex-1 — so the content
            area's start position is always exactly the header's real
            rendered height, never a guess. */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200 z-20 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={handleClose}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-600 flex-shrink-0"
            >
              <X size={20} />
            </button>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
              {contact?.name || "Contact Details"}
            </h2>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {currentContactIds.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={goToPrev}
                  disabled={!hasPrev}
                  className={`p-1.5 rounded hover:bg-gray-100 ${!hasPrev && "opacity-40 cursor-not-allowed"}`}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={goToNext}
                  disabled={!hasNext}
                  className={`p-1.5 rounded hover:bg-gray-100 ${!hasNext && "opacity-40 cursor-not-allowed"}`}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}

            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hidden lg:block"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>

            <button
              onClick={() => onEdit(contact)}
              className="flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 whitespace-nowrap"
            >
              <EditIcon size={16} />
              <span className="hidden sm:inline">Edit</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content Area — flex-1 fills whatever space the header
            (above) didn't take, instead of a fixed height guess. */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-gray-600 font-medium text-center px-6">
                Loading contact details...
              </p>
            </div>
          ) : (
            <div className="p-4 sm:p-6">
              {/* Profile Header – improved wrapping & spacing */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 mb-8">
                <ProfilePicture
                  contact={contact}
                  size="w-20 h-20 sm:w-16 sm:h-16"
                  textSize="text-3xl sm:text-2xl"
                />

                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1.5 truncate">
                    {contact.name}
                  </h1>

                  {contact.jobTitle && (
                    <p className="text-sm sm:text-base text-gray-600 mb-3">
                      {contact.jobTitle}
                    </p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-gray-700">
                    {contact.email && (
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <Mail
                          size={16}
                          className="text-gray-500 flex-shrink-0"
                        />
                        <a
                          href={`mailto:${contact.email}?body=${encodeURIComponent(`Dear ${contact.name || "Sir/Madam"},\n\n\nRegards`)}`}
                          className="text-blue-600 hover:underline truncate"
                        >
                          {contact.email}
                        </a>
                      </div>
                    )}

                    {contact.phone && (
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <CellphoneIcon
                          className="w-4 h-4 text-gray-500 flex-shrink-0"
                        />
                        <a
                          href={`tel:${contact.phone}`}
                          className="text-blue-600 hover:underline truncate"
                        >
                          {contact.phone}
                        </a>
                      </div>
                    )}

                    {company && (
                      <div className="flex items-center gap-2.5 col-span-1 sm:col-span-2 overflow-hidden">
                        <Building2
                          size={16}
                          className="text-gray-500 flex-shrink-0"
                        />
                        <Link
                          to={`/companies/${company._id}`}
                          className="text-blue-600 hover:underline truncate"
                        >
                          {company.name}
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Main Content – two-column grid with safe overflow */}
              <div className="grid grid-cols-1 gap-6 lg:gap-8">
                {/* Left Column */}
                <div className="min-w-0">
                  <nav className="flex border-b border-gray-200 mb-5 overflow-x-auto pb-1 scrollbar-hide">
                    {tabsLeft.map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTabLeft(tab)}
                        className={`px-5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                          activeTabLeft === tab
                            ? "border-b-2 border-blue-600 text-blue-600 font-semibold"
                            : "text-gray-600 hover:text-gray-900"
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </nav>

                  <div className="overflow-x-hidden">
                    {activeTabLeft === "Details" && (
                      <div className="overflow-x-auto">
                        <BasicDetails
                          contact={contact}
                          company={company}
                          deals={deals}
                          isQuickView={true}
                          onDealCreated={() => loadContact(contactId)}
                        />
                      </div>
                    )}

                    {activeTabLeft === "Call Logs" && (
                      <div className="overflow-x-auto">
                        <CallLogs contactId={contactId} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column */}
                <div className="min-w-0">
                  <nav className="flex flex-wrap gap-2 mb-5 border-b border-gray-200 pb-3">
                    {tabsRight.map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTabRight(tab)}
                        className={`px-4 sm:px-5 py-2 text-sm font-medium rounded-full transition-colors flex-shrink-0 ${
                          activeTabRight === tab
                            ? "bg-blue-600 text-white shadow-sm"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </nav>

                  <div className="overflow-x-hidden">
                    {activeTabRight === "Notes" && (
                      <NoteSection contactId={contactId} isQuickView={true} />
                    )}
                    {activeTabRight === "Tasks" && (
                      <div className="overflow-x-auto">
                        <ContactTasksTable contactId={contactId} />
                      </div>
                    )}
                    {activeTabRight === "Meetings" && (
                      <div className="overflow-x-auto">
                        <MeetingsTable contactId={contactId} />
                      </div>
                    )}
                    {activeTabRight === "Calendar" && (
                      <div className="overflow-x-auto">
                        <CalendarIcon contactId={contactId} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Form Overlay */}
      {showEditForm && contact && (
        <QuickContactForm
          companies={[]}
          editContact={contact}
          onContactUpdated={() => {
            setShowEditForm(false);
            loadContact(contactId);
          }}
          onRequestClose={() => setShowEditForm(false)}
        />
      )}
    </>
  );
};

export default ContactQuickView;
