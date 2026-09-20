import DeleteIcon from "../common/DeleteIcon";
import VideoIcon from "../common/VideoIcon";
import Checkbox from "../common/Checkbox";
import CellphoneIcon from "../common/CellphoneIcon";
import PlusIcon from "../common/PlusIcon";
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import ReactQuill from "react-quill-new";
import "react-quill/dist/quill.snow.css";
import API from "../../services/api";
import CustomFieldsSection, { getMissingRequiredFields } from "../common/CustomFieldsSection";
import toast from "react-hot-toast";
import SearchIcon from "../common/SearchIcon";
import { useSystemSettings } from "../../hooks/useSystemSettings";
import {
  X,
  Clock,
  AlertTriangle,
  CheckCircle2,
  User,
  Building,
  Building2,
  Truck,
  Lightbulb,
  Timer,
  Flag,
  Briefcase,
  ChevronDown,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link2,
  Quote,
  Code,
  Type,
} from "lucide-react";
import TeamIcon from "../common/TeamIcon";
import ListIcon from "../common/ListIcon";
import EditIcon from "../common/EditIcon";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

// Same toolbar/editor system used by the Notes feature (NoteSection.jsx),
// reused here so the meeting Description field gets the same rich-text
// formatting instead of a plain textarea.
const MeetingQuillToolbar = () => (
  <div id="meeting-toolbar" className="flex flex-wrap items-center gap-1 p-2 bg-white border-b border-[#1F2937]/10 rounded-t-2xl">
    <div className="flex gap-0.5 pr-1.5">
      <button type="button" className="ql-header w-6 h-6 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" value="1">
        <Heading1 className="w-3.5 h-3.5" />
      </button>
      <button type="button" className="ql-header w-6 h-6 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" value="2">
        <Heading2 className="w-3.5 h-3.5" />
      </button>
      <button type="button" className="ql-header w-6 h-6 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" value="3">
        <Heading3 className="w-3.5 h-3.5" />
      </button>
      <button type="button" className="ql-header w-6 h-6 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" value="4">
        <Heading4 className="w-3.5 h-3.5" />
      </button>
    </div>

    <div className="flex gap-0.5 px-1.5">
      <button type="button" className="ql-bold w-6 h-6 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
        <Bold className="w-3.5 h-3.5" />
      </button>
      <button type="button" className="ql-italic w-6 h-6 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
        <Italic className="w-3.5 h-3.5" />
      </button>
      <button type="button" className="ql-underline w-6 h-6 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
        <Underline className="w-3.5 h-3.5" />
      </button>
      <button type="button" className="ql-strike w-6 h-6 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
        <Strikethrough className="w-3.5 h-3.5" />
      </button>
    </div>

    <div className="flex gap-0.5 px-1.5">
      <button type="button" className="ql-list w-6 h-6 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" value="ordered">
        <ListOrdered className="w-3.5 h-3.5" />
      </button>
      <button type="button" className="ql-list w-6 h-6 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" value="bullet">
        <ListIcon className="w-3.5 h-3.5" />
      </button>
      <button type="button" className="ql-indent w-6 h-6 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" value="-1">
        <AlignLeft className="w-3.5 h-3.5" />
      </button>
      <button type="button" className="ql-indent w-6 h-6 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" value="+1">
        <AlignRight className="w-3.5 h-3.5" />
      </button>
    </div>

    <div className="flex gap-0.5 px-1.5">
      <button type="button" className="ql-align w-6 h-6 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" value="">
        <AlignLeft className="w-3.5 h-3.5" />
      </button>
      <button type="button" className="ql-align w-6 h-6 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" value="center">
        <AlignCenter className="w-3.5 h-3.5" />
      </button>
      <button type="button" className="ql-align w-6 h-6 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" value="right">
        <AlignRight className="w-3.5 h-3.5" />
      </button>
      <button type="button" className="ql-align w-6 h-6 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" value="justify">
        <AlignJustify className="w-3.5 h-3.5" />
      </button>
    </div>

    <div className="flex gap-0.5 pl-1.5">
      <button type="button" className="ql-link w-6 h-6 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
        <Link2 className="w-3.5 h-3.5" />
      </button>
      <button type="button" className="ql-blockquote w-6 h-6 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
        <Quote className="w-3.5 h-3.5" />
      </button>
      <button type="button" className="ql-code-block w-6 h-6 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
        <Code className="w-3.5 h-3.5" />
      </button>
      <button type="button" className="ql-clean w-6 h-6 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
        <Type className="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
);

const MeetingEditorStyles = () => (
  <style jsx global>{`
    .dc-meeting-editor .ql-toolbar.ql-snow,
    .dc-meeting-editor .ql-container.ql-snow,
    .dc-meeting-editor .ql-editor {
      border: none !important;
    }
    .dc-meeting-editor.quill-wrap {
      border: 1px solid rgba(31, 41, 55, 0.1);
      border-radius: 1rem;
      overflow: hidden;
    }
    .dc-meeting-editor .ql-container.ql-snow {
      font-family: inherit !important;
    }
    .dc-meeting-editor .ql-editor {
      padding: 0.75rem !important;
      min-height: 120px !important;
      font-size: 12px !important;
      line-height: 1.6 !important;
      color: #1F2937 !important;
    }
    .dc-meeting-editor .ql-editor.ql-blank::before {
      left: 0.75rem !important;
      color: #1F2937 !important;
      opacity: 0.5 !important;
      font-style: normal !important;
      font-weight: 400 !important;
      font-size: 12px !important;
    }
    #meeting-toolbar button {
      border: none !important;
      color: #6b7280 !important;
      transition: all 0.2s !important;
    }
    #meeting-toolbar button:hover {
      background-color: #f9fafb !important;
      color: #111827 !important;
    }
    #meeting-toolbar button.ql-active {
      background-color: #eff6ff !important;
      color: #2563eb !important;
    }
    #meeting-toolbar .ql-stroke {
      stroke: currentColor !important;
    }
    #meeting-toolbar .ql-fill {
      fill: currentColor !important;
    }
  `}</style>
);

const baseMeetingQuillModules = {
  toolbar: {
    container: "#meeting-toolbar",
  },
  clipboard: {
    matchVisual: false,
  },
};

const meetingQuillFormats = [
  "header", "bold", "italic", "underline", "strike",
  "list", "indent", "align", "link", "blockquote", "code-block",
];

const initialState = {
  title: "",
  date: "",
  time: "09:00",
  duration: 60,
  priority: "medium",
  meetingType: "in-person",
  meetingCategory: "",
  location: "",
  description: "",
  linkedContactId: null,
  linkedDealId: null,
  linkedInvoiceId: null,
  participants: [],
  internalParticipants: [],
  linkedTo: "company",
  contactId: null,
  companyId: null,
  vendorId: null,
  additionalFields: [],
};

const ParticipantChip = ({ user, onRemove, isRemovable = false }) => (
  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium border border-blue-200">
    <User className="w-3 h-3" />
    <span>{user?.name || "Unknown"}</span>
    {isRemovable && onRemove && (
      <button onClick={onRemove} className="hover:bg-blue-100 rounded-full p-0.5">
        <X className="w-3 h-3" />
      </button>
    )}
  </div>
);

const PriorityChip = ({ priority }) => {
  const colors = {
    low: { bg: 'bg-[#E6F7EF]', text: 'text-[#1FA971]', border: 'border-[#B9E7D3]' },
    medium: { bg: 'bg-[#FDF3E6]', text: 'text-[#EA9927]', border: 'border-[#F7DDB8]' },
    high: { bg: 'bg-[#FCEAEA]', text: 'text-[#EA4B4B]', border: 'border-[#F5C7C7]' },
  };
  const color = colors[priority] || colors.medium;

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 ${color.bg} ${color.text} rounded-lg text-sm font-medium ${color.border}`}>
      <Flag className="w-3 h-3" />
      <span className="capitalize">{priority}</span>
    </div>
  );
};

// isOpen/onOpenChange are controlled by the parent form (a single shared
// "which dropdown is open" key) rather than each instance owning its own
// state — otherwise opening Meeting Type doesn't close Priority, and their
// option lists render stacked on top of each other.
const SingleSelectDropdown = ({ options, value, onChange, disabled, isOpen, onOpenChange }) => {
  const selectedOption = options.find(opt => opt.value === value) || options[0];

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onOpenChange(!isOpen)}
        className={`w-full flex items-center justify-between gap-2 px-3 h-[38px] rounded-full text-[13px] font-medium focus:outline-none transition-all border border-[#1F2937]/10 bg-white ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
      >
        {/* No icon chip — these read as plain selects, matching Category. */}
        <span className="capitalize text-[#1F2937]">{selectedOption.label}</span>
        {!disabled && <ChevronDown className={`w-3.5 h-3.5 text-[#1F2937] opacity-50 transition-transform ${isOpen ? "rotate-180" : ""}`} />}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => onOpenChange(false)} />
          <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-1 overflow-hidden animate-in fade-in zoom-in duration-200">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  onOpenChange(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-1.5 text-[13px] transition-colors hover:bg-gray-50 ${value === option.value ? 'bg-blue-50/50 text-blue-600' : 'text-gray-600'
                  }`}
              >
                <span className="font-medium">{option.label}</span>
                {value === option.value && <CheckCircle2 className="w-4 h-4 ml-auto text-blue-600" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// Compact searchable picker for the linked record (contact / company /
// vendor). Styled as a right-aligned pill so it sits in the same meta-row
// rhythm as the Duration / Meeting Type / Priority dropdowns instead of
// being a full-width field like the old modal used.
const EntityPickerDropdown = ({ entities, value, onChange, entityType, disabled, isOpen, onOpenChange, displayKey = "name" }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const wrapperRef = useRef(null);

  const selected = entities.find((e) => e._id === value);
  const filtered = entities.filter((e) =>
    (e[displayKey] || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleToggle = () => {
    if (isOpen) {
      onOpenChange(false);
      return;
    }
    onOpenChange(true);
    // Only scroll by however much the open panel actually overflows the
    // scrollable form, instead of yanking the trigger to the very top.
    requestAnimationFrame(() => {
      const el = wrapperRef.current;
      if (!el) return;
      let scroller = el.parentElement;
      while (scroller && scroller.scrollHeight <= scroller.clientHeight) {
        scroller = scroller.parentElement;
      }
      if (!scroller) return;
      const PANEL_HEIGHT = 220; // search box + max-h-40 list
      const overflow =
        el.getBoundingClientRect().bottom +
        PANEL_HEIGHT -
        scroller.getBoundingClientRect().bottom;
      if (overflow > 0) {
        scroller.scrollBy({ top: overflow + 8, behavior: "smooth" });
      }
    });
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className={`w-full flex items-center justify-between gap-2 px-3 h-[38px] rounded-full text-[13px] font-medium focus:outline-none transition-all border border-[#1F2937]/10 bg-white ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`truncate ${selected ? "text-[#1F2937]" : "text-[#1F2937] opacity-50"}`}>
            {selected?.[displayKey] || selected?.name || `Select ${entityType}`}
          </span>
        </div>
        {!disabled && <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 text-[#1F2937] opacity-50 transition-transform ${isOpen ? "rotate-180" : ""}`} />}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => onOpenChange(false)} />
          <div className="absolute left-0 right-0 mt-2 w-full bg-white border border-gray-100 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <SearchIcon className="absolute left-3 -translate-y-1/2 top-1/2 w-4 h-4 text-[#525866]" />
                <input
                  type="text"
                  autoFocus
                  placeholder={`Search ${entityType}...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="max-h-40 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-4 py-3 text-xs text-center text-gray-400">
                  No {entityType} yet
                </p>
              ) : (
                filtered.map((entity) => (
                  <button
                    key={entity._id}
                    type="button"
                    onClick={() => {
                      onChange(entity._id);
                      onOpenChange(false);
                      setSearchTerm("");
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] transition-colors hover:bg-gray-50 ${value === entity._id ? 'bg-blue-50/50 text-blue-600' : 'text-gray-600'}`}
                  >
                    <span className="font-medium truncate">{entity[displayKey] || entity.name}</span>
                    {value === entity._id && <CheckCircle2 className="w-3.5 h-3.5 ml-auto text-blue-600 flex-shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const MultiSelectDropdown = ({ users, selectedUsers, onSelectionChange, placeholder = "Select participants", isOpen, onOpenChange }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const wrapperRef = useRef(null);

  const openDropdown = () => {
    onOpenChange(true);
    // The list opens BELOW the button, so scroll only by however much it
    // overflows the bottom of the scrollable panel — pulling the trigger all
    // the way to the top moves the form far more than needed.
    requestAnimationFrame(() => {
      const el = wrapperRef.current;
      if (!el) return;
      let scroller = el.parentElement;
      while (scroller && scroller.scrollHeight <= scroller.clientHeight) {
        scroller = scroller.parentElement;
      }
      if (!scroller) return;
      const overflow =
        el.getBoundingClientRect().bottom + 220 - scroller.getBoundingClientRect().bottom;
      if (overflow > 0) scroller.scrollBy({ top: overflow + 8, behavior: "smooth" });
    });
  };

  const filteredUsers = users.filter(user =>
    (user.name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleUserToggle = (userId) => {
    const updatedSelection = selectedUsers.includes(userId)
      ? selectedUsers.filter(id => id !== userId)
      : [...selectedUsers, userId];
    onSelectionChange(updatedSelection);
    onOpenChange(false);
  };

  const selectedUsersList = users.filter(user => selectedUsers.includes(user._id));

  return (
    <div className="space-y-3">
      {selectedUsersList.length > 0 && (
        <div className="flex flex-wrap gap-2 p-2 bg-[#F9F9FB] rounded-2xl border border-[#1F2937]/10">
          {selectedUsersList.map((user) => (
            <ParticipantChip
              key={user._id}
              user={user}
              isRemovable={true}
              onRemove={() => handleUserToggle(user._id)}
            />
          ))}
        </div>
      )}
      <div ref={wrapperRef} className="relative">
        <button
          type="button"
          onClick={() => (isOpen ? onOpenChange(false) : openDropdown())}
          className="w-full flex items-center justify-between px-3 h-[38px] rounded-full text-[13px] border border-[#1F2937]/10 bg-white hover:bg-gray-50 transition-colors focus:outline-none"
        >
          <span className={selectedUsers.length === 0 ? "text-[#1F2937] opacity-50" : "text-[#1F2937]"}>
            {selectedUsers.length === 0 ? placeholder : `${selectedUsers.length} participant(s) selected`}
          </span>
          <PlusIcon className="w-4 h-4 text-[#1F2937] opacity-50 flex-shrink-0" />
        </button>
        {isOpen && (
          <>
          <div className="fixed inset-0 z-40" onClick={() => onOpenChange(false)} />
          <div className="absolute z-50 w-full mt-2 bg-white border border-gray-300 rounded-xl shadow-xl max-h-64 overflow-hidden">
            <div className="p-3 border-b border-gray-200">
              <div className="relative">
                <SearchIcon className="absolute left-3 -translate-y-1/2 top-1/2 w-4 h-4 text-[#525866]" />
                <input
                  type="text"
                  placeholder="Search participants..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  <TeamIcon className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No users found</p>
                </div>
              ) : (
                <div className="p-2">
                  {filteredUsers.map((user) => (
                    <label
                      key={user._id}
                      className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                    >
                      <Checkbox checked={selectedUsers.includes(user._id)} onChange={() => handleUserToggle(user._id)} />
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                          <User className="w-3 h-3 text-blue-600" />
                        </div>
                        <span className="text-sm font-medium text-gray-700">{user.name}</span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
};

const TimeConflictAlert = ({ conflict, suggestedTimes, onTimeSelect }) => (
  <div className="space-y-3">
    <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-4 h-4 text-red-500" />
        <p className="text-sm font-semibold text-red-700">Time Conflict Detected</p>
      </div>
      <p className="text-sm text-red-600">{conflict.message}</p>
    </div>
    {suggestedTimes.length > 0 && (
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
        <div className="flex items-center gap-2 mb-2">
          <Lightbulb className="w-4 h-4 text-blue-500" />
          <p className="text-sm font-semibold text-blue-700">Suggested Available Times</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {suggestedTimes.map((time) => (
            <button
              key={time}
              type="button"
              onClick={() => onTimeSelect(time)}
              className="px-3 py-1.5 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors font-medium"
            >
              {new Date(`2024-01-01T${time}`).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              })}
            </button>
          ))}
        </div>
      </div>
    )}
  </div>
);

const MeetingTypeIcon = ({ type }) => {
  const icons = {
    'in-person': <Building className="w-4 h-4" />,
    'video-call': <VideoIcon className="w-4 h-4" />,
    'phone-call': <CellphoneIcon className="w-4 h-4" />
  };
  return icons[type] || icons['in-person'];
};

const AdminMeetingForm = ({
  open,
  mode,
  meetingData,
  calendarDate,
  users = [],
  contacts: allContacts = [],
  companies = [],
  vendors = [],
  onSave,
  onDelete,
  onClose,
  startInEditMode,
  // When set, the meeting is scoped to a single company (e.g. opened from
  // that company's own Meetings tab) — the Entity Type/record pickers are
  // hidden and the company is preset instead of asking the user to pick it
  // again from the full list.
  initialCompanyId = null,
  // Display-only label shown in place of the hidden Entity Type/Company
  // picker when initialCompanyId is set.
  companyName = "",
  // Same idea for the contact profile's Meetings tab: the meeting is scoped
  // to one contact, so the pickers give way to a read-only label.
  initialContactId = null,
  contactName = "",
  // Deal profile's Meetings tab. A meeting is never "linked to" a deal the
  // way it is to a company or contact - the deal rides on linkedDealId - so
  // this presets that field and shows the deal as a read-only label.
  initialDealId = null,
  dealName = "",
}) => {
  const [form, setForm] = useState(initialState);
  useBodyScrollLock(open);
  // Org's MeetingFields definitions — drives the Custom Fields section below.
  const [meetingFieldDefs, setMeetingFieldDefs] = useState([]);
  const { meetingTypes } = useSystemSettings();
  // Which of the Entity Type/Related To/Duration/Meeting Type/Priority
  // dropdowns is open, if any — shared so opening one closes the others
  // instead of them stacking on top of each other.
  const [openDropdown, setOpenDropdown] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [googleStatus, setGoogleStatus] = useState(null); // { configured, connected, connectedEmail }
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [isSliding, setIsSliding] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [existingMeetings, setExistingMeetings] = useState([]);
  const [companyContacts, setCompanyContacts] = useState([]);
  const [linkableDeals, setLinkableDeals] = useState([]);
  const [linkableInvoices, setLinkableInvoices] = useState([]);
  const [timeConflict, setTimeConflict] = useState(null);
  const [errors, setErrors] = useState({});
  const quillModules = useMemo(() => baseMeetingQuillModules, []);
  const [isEditMode, setIsEditMode] = useState(mode === "create" || !!startInEditMode);
  const titleInputRef = useRef(null);
  const dateInputRef = useRef(null);
  const linkedToRef = useRef(null);
  const entityRef = useRef(null);
  const participantsRef = useRef(null);

  const entityTypeOptions = [
    { value: 'company', label: 'Company', icon: Building2, className: 'bg-cyan-50 text-cyan-600' },
    { value: 'contact', label: 'Contact', icon: User, className: 'bg-blue-50 text-blue-600' },
    { value: 'vendor', label: 'Vendor', icon: Truck, className: 'bg-purple-50 text-purple-600' },
  ];

  const meetingTypeOptions = [
    { value: 'in-person', label: 'In-person', icon: Building, className: 'bg-orange-50 text-orange-600' },
    { value: 'video-call', label: 'Video Call', icon: VideoIcon, className: 'bg-blue-50 text-blue-600' },
    { value: 'phone-call', label: 'Phone Call', icon: CellphoneIcon, className: 'bg-purple-50 text-purple-600' },
  ];

  const priorityOptions = [
    { value: 'low', label: 'Low', icon: Flag, className: 'bg-[#E6F7EF] text-[#1FA971]' },
    { value: 'medium', label: 'Medium', icon: Flag, className: 'bg-[#FDF3E6] text-[#EA9927]' },
    { value: 'high', label: 'High', icon: Flag, className: 'bg-[#FCEAEA] text-[#EA4B4B]' },
  ];

  const durationOptions = [
    { value: 15, label: '15 Mins', icon: Timer, className: 'bg-slate-50 text-slate-600' },
    { value: 30, label: '30 Mins', icon: Timer, className: 'bg-slate-50 text-slate-600' },
    { value: 60, label: '60 Mins', icon: Timer, className: 'bg-slate-50 text-slate-600' },
    { value: 90, label: '1.5 Hours', icon: Timer, className: 'bg-slate-50 text-slate-600' },
    { value: 120, label: '2 Hours', icon: Timer, className: 'bg-slate-50 text-slate-600' },
  ];

  const fetchCompanyContacts = useCallback(async (companyId) => {
    if (!companyId) {
      setCompanyContacts([]);
      return;
    }
    try {
      const res = await API.get(`/contacts/company/${companyId}`);
      setCompanyContacts(res.data || []);
    } catch (error) {
      console.error("Error fetching company contacts:", error);
      setCompanyContacts([]);
    }
  }, []);

  const fetchMeetingsForDate = useCallback(async (date) => {
    try {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);

      const res = await API.get("/meetings", {
        params: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        }
      });
      setExistingMeetings(res.data.meetings || []);
    } catch (error) {
      console.error("Error fetching meetings:", error);
      setExistingMeetings([]);
    }
  }, []);

  const checkTimeConflict = useCallback((selectedDate, selectedTime, duration) => {
    if (!selectedDate || !selectedTime) return null;

    const selectedDateTime = new Date(selectedDate);
    const [hours, minutes] = selectedTime.split(':');
    selectedDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

    const selectedStartTime = selectedDateTime.getTime();
    const selectedEndTime = selectedStartTime + (duration * 60 * 1000);

    for (const meeting of existingMeetings) {
      if (mode === "view" && isEditMode && meeting._id === meetingData?._id) continue;

      const meetingStart = new Date(meeting.scheduledAt).getTime();
      const meetingEnd = meetingStart + (meeting.duration * 60 * 1000);

      if (
        (selectedStartTime >= meetingStart && selectedStartTime < meetingEnd) ||
        (selectedEndTime > meetingStart && selectedEndTime <= meetingEnd) ||
        (selectedStartTime <= meetingStart && selectedEndTime >= meetingEnd)
      ) {
        return {
          conflictWith: meeting,
          message: `Conflicts with "${meeting.title}" (${new Date(meeting.scheduledAt).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          })} - ${new Date(meetingEnd).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          })})`
        };
      }
    }
    return null;
  }, [existingMeetings, mode, isEditMode, meetingData]);

  // Initialize form when modal opens
  useEffect(() => {
    if (open) {
      setShouldRender(true);
      setTimeout(() => setIsSliding(true), 10);
      API.get("/auth/google/status")
        .then((res) => setGoogleStatus(res.data))
        .catch(() => setGoogleStatus(null));
      API.get("/deals")
        .then((res) => setLinkableDeals(res.data || []))
        .catch(() => setLinkableDeals([]));
      API.get("/invoices")
        .then((res) => setLinkableInvoices(res.data || []))
        .catch(() => setLinkableInvoices([]));
      API.get("/meeting-fields")
        .then((res) => setMeetingFieldDefs(res.data?.fields || []))
        .catch(() => setMeetingFieldDefs([]));

      if (meetingData && mode === "view") {
        const initialFormData = {
          ...meetingData,
          date: meetingData?.scheduledAt ? new Date(meetingData?.scheduledAt).toISOString().slice(0, 10) : "",
          time: meetingData?.scheduledAt ? new Date(meetingData?.scheduledAt).toISOString().slice(11, 16) : "09:00",
          participants: meetingData.participants?.map(p => p._id || p) || [],
          internalParticipants: meetingData.internalParticipants?.map(p => p._id || p) || [],
          linkedTo:
            meetingData.linkedTo ||
            (meetingData.contact ? "contact" : meetingData.company ? "company" : "vendor"),
          contactId: meetingData.contact?._id || meetingData.contact || null,
          companyId: meetingData.company?._id || meetingData.company || null,
          vendorId: meetingData.vendor?._id || meetingData.vendor || null,
          linkedContactId: meetingData.linkedContactId?._id || meetingData.linkedContactId || null,
          linkedDealId: meetingData.linkedDealId?._id || meetingData.linkedDealId || null,
          linkedInvoiceId: meetingData.linkedInvoiceId?._id || meetingData.linkedInvoiceId || null,
        };
        setForm(initialFormData);

        if (initialFormData.linkedTo === "company" && initialFormData.companyId) {
          fetchCompanyContacts(initialFormData.companyId);
        }
        if (initialFormData.date) {
          fetchMeetingsForDate(new Date(initialFormData.date));
        }
      } else {
        const initialFormData = {
          ...initialState,
          date: calendarDate || "",
          linkedTo: initialContactId ? "contact" : "company",
          companyId: initialCompanyId || null,
          contactId: initialContactId || null,
          linkedDealId: initialDealId || null,
        };
        setForm(initialFormData);
        setCompanyContacts([]);

        if (initialCompanyId) {
          fetchCompanyContacts(initialCompanyId);
        }
        if (calendarDate) {
          fetchMeetingsForDate(calendarDate);
        }
      }

      setErrors({});
      setIsEditMode(mode === "create" || !meetingData || !!startInEditMode);
    } else {
      setIsSliding(false);
      setTimeout(() => setShouldRender(false), 300);
      setTimeConflict(null);
    }
  }, [open, meetingData, mode, calendarDate, fetchMeetingsForDate, fetchCompanyContacts, startInEditMode, initialContactId, initialCompanyId, initialDealId]);

  const handleChange = (key, val) => {
    setForm(f => {
      const newForm = { ...f, [key]: val };

      // Switching entity type invalidates whichever record was picked, and
      // the client-contact list only makes sense for a company.
      if (key === "linkedTo") {
        newForm.contactId = null;
        newForm.companyId = null;
        newForm.vendorId = null;
        newForm.participants = [];
        setCompanyContacts([]);
      }

      if (key === "companyId" && val) {
        fetchCompanyContacts(val);
        newForm.participants = [];
      }

      return newForm;
    });

    if (errors[key]) {
      setErrors(prev => ({ ...prev, [key]: null }));
    }

    if (key === 'date' || key === 'time' || key === 'duration') {
      const newDate = key === 'date' ? val : form.date || calendarDate;
      const newTime = key === 'time' ? val : form.time;
      const newDuration = key === 'duration' ? val : form.duration;

      if (key === 'date' && val) {
        fetchMeetingsForDate(new Date(val));
      }

      if (newDate) {
        setTimeout(() => {
          const conflict = checkTimeConflict(newDate, newTime, newDuration);
          setTimeConflict(conflict);
        }, 100);
      }
    }
  };

  const getSuggestedTimes = () => {
    const selectedDate = form.date || calendarDate;
    if (!selectedDate) return [];

    const suggestions = [];
    const businessHours = Array.from({ length: 10 }, (_, i) => 9 + i);

    for (const hour of businessHours) {
      const timeSlots = ['00', '30'];
      for (const minutes of timeSlots) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minutes}`;
        const conflict = checkTimeConflict(selectedDate, timeString, form.duration);
        if (!conflict) {
          suggestions.push(timeString);
        }
      }
    }

    return suggestions.slice(0, 4);
  };

  const getSelectedEntityId = () =>
    form.linkedTo === "contact"
      ? form.contactId
      : form.linkedTo === "company"
        ? form.companyId
        : form.vendorId;

  const validateForm = () => {
    const newErrors = {};

    if (!form.title?.trim()) newErrors.title = "Meeting title is required";
    if (!form.date && !calendarDate) newErrors.date = "Date is required";
    if (!form.linkedTo) newErrors.linkedTo = "Please select an entity type";
    if (!getSelectedEntityId()) newErrors.entity = `Please select a ${form.linkedTo}`;
    if (form.linkedTo === "company" && form.participants.length === 0) {
      newErrors.participants = "At least one client contact is required";
    }
    Object.assign(
      newErrors,
      getMissingRequiredFields(meetingFieldDefs, form.additionalFields, !!meetingData)
    );

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getScheduledAt = () => {
    const date = new Date(form.date || calendarDate);
    const [h, m] = form.time.split(":").map(Number);
    date.setHours(h, m, 0, 0);
    return date.toISOString();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please fill in all required fields");
      // Scroll to whichever invalid field sits highest on screen, rather
      // than just reporting via toast that something is wrong.
      const latestErrors = {};
      if (!form.title?.trim()) latestErrors.title = true;
      if (!form.date && !calendarDate) latestErrors.date = true;
      if (!form.linkedTo) latestErrors.linkedTo = true;
      if (!getSelectedEntityId()) latestErrors.entity = true;
      if (form.linkedTo === "company" && form.participants.length === 0) latestErrors.participants = true;

      const candidates = [
        latestErrors.title ? titleInputRef.current : null,
        latestErrors.date ? dateInputRef.current : null,
        latestErrors.linkedTo ? linkedToRef.current : null,
        latestErrors.entity ? entityRef.current : null,
        latestErrors.participants ? participantsRef.current : null,
      ].filter(Boolean);

      let topMost = null;
      for (const el of candidates) {
        if (!topMost || el.getBoundingClientRect().top < topMost.getBoundingClientRect().top) {
          topMost = el;
        }
      }
      topMost?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const dateForValidation = form.date || calendarDate;
    const conflict = checkTimeConflict(dateForValidation, form.time, form.duration);
    if (conflict) {
      toast.error(`Cannot schedule meeting: ${conflict.message}`);
      return;
    }

    setLoading(true);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        duration: form.duration,
        priority: form.priority,
        meetingType: form.meetingType,
        meetingCategory: form.meetingCategory,
        location: form.location,
        linkedContactId: form.linkedContactId,
        linkedDealId: form.linkedDealId,
        linkedInvoiceId: form.linkedInvoiceId,
        linkedTo: form.linkedTo,
        scheduledAt: getScheduledAt(),
        participants: form.participants || [],
        internalParticipants: form.internalParticipants || [],
        additionalFields: form.additionalFields || [],
      };

      if (form.linkedTo === "contact") {
        payload.contactId = form.contactId;
      } else if (form.linkedTo === "company") {
        payload.companyId = form.companyId;
      } else if (form.linkedTo === "vendor") {
        payload.vendorId = form.vendorId;
      }

      if (meetingData && mode === "view") {
        await API.put(`/meetings/${meetingData._id}`, payload);
        toast.success("Meeting updated successfully");
      } else if (onSave) {
        await onSave(payload);
      } else {
        await API.post("/meetings", payload);
        toast.success("Meeting scheduled successfully");
      }
      onClose();
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || (meetingData && mode === "view" ? "Failed to update meeting" : "Failed to schedule meeting"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await onDelete(meetingData._id);
      toast.success("Meeting deleted successfully");
      onClose();
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to delete meeting");
      }
    }
  };

  if (!shouldRender) return null;

  const entityList =
    form.linkedTo === "contact" ? allContacts : form.linkedTo === "vendor" ? vendors : companies;
  const readOnly = !isEditMode && mode === "view";

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300"
        style={{ opacity: isSliding ? 1 : 0 }}
        onClick={onClose}
      />
      <div
        className={`fixed dc-panel-card dc-panel-w z-[10001] bg-white shadow-2xl transform transition-transform duration-300 ease-out overflow-hidden ${
          isSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"
        }`}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
            <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
              {mode === "view" && meetingData ? "Edit Meeting" : "Add New Meeting"}
            </h2>
            <button
              onClick={onClose}
              title="Close"
              className="w-5 h-5 flex items-center justify-center text-[#1C1B1F] hover:opacity-70 transition-opacity"
              aria-label="Close"
            >
              <X className="w-[18px] h-[18px]" strokeWidth={2} />
            </button>
          </div>

          {/* Form Body */}
          <div className="flex-1 overflow-y-auto">
            <form onSubmit={handleSubmit} noValidate className="flex flex-col h-full">
              {/* Content */}
              <div className="px-8 py-6 space-y-6">
                <div ref={titleInputRef}>
                  <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                    Meeting Title <span className="text-[#FF4935]">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => handleChange("title", e.target.value)}
                    className={`w-full border rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 font-inter disabled:opacity-50 ${errors.title ? "border-red-500 focus:ring-red-500" : "border-[#1F2937]/10 focus:ring-blue-500"
                      }`}
                    placeholder="Enter Meeting Title"
                    disabled={readOnly}
                  />
                  {errors.title && <p className="text-red-500 text-xs mt-1 font-inter">{errors.title}</p>}
                </div>

                {/* Meeting Type */}
                <div>
                  <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Meeting Type</label>
                  <SingleSelectDropdown
                    options={meetingTypeOptions}
                    value={form.meetingType}
                    onChange={(val) => handleChange("meetingType", val)}
                    disabled={readOnly}
                    isOpen={openDropdown === "meetingType"}
                    onOpenChange={(open) => setOpenDropdown(open ? "meetingType" : null)}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <span className="flex-1 h-px bg-[#D9D9D9]" />
                  <h3 className="flex-shrink-0 text-[14px] font-medium leading-[120%] text-[#1F2937]">
                    Meeting Information
                  </h3>
                  <span className="flex-1 h-px bg-[#D9D9D9]" />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[13px] font-medium text-[#161618] tracking-[-0.05em]">Location</label>
                    <div className="flex items-center gap-3">
                    {!readOnly && googleStatus?.configured && !googleStatus?.connected && (
                      <button
                        type="button"
                        disabled={connectingGoogle}
                        onClick={async () => {
                          setConnectingGoogle(true);
                          try {
                            const res = await API.get("/auth/google/connect");
                            if (res.data?.authUrl) {
                              window.location.href = res.data.authUrl;
                            } else {
                              toast.error("Could not start Google connect flow");
                              setConnectingGoogle(false);
                            }
                          } catch {
                            toast.error("Could not start Google connect flow");
                            setConnectingGoogle(false);
                          }
                        }}
                        className="text-xs font-medium text-gray-500 hover:text-gray-700 underline disabled:opacity-50"
                        title="One-time setup: connects a Google account so Generate Link can create real Google Meet links"
                      >
                        {connectingGoogle ? "Connecting…" : "Connect Google Account"}
                      </button>
                    )}
                    {!readOnly && (
                      <button
                        type="button"
                        disabled={generatingLink}
                        onClick={async () => {
                          setGeneratingLink(true);
                          try {
                            // Real Zoom or Google Meet link — tries Zoom
                            // first (if configured), then this org's
                            // connected Google account. Same link works for
                            // staff and the external client, no login
                            // required on either side.
                            const res = await API.post("/meetings/generate-video-link", {
                              title: form.title,
                              scheduledAt: form.date ? getScheduledAt() : undefined,
                              duration: form.duration,
                            });
                            if (res.data?.provider && res.data?.joinUrl) {
                              handleChange("location", res.data.joinUrl);
                            } else if (res.data?.error) {
                              toast.error(res.data.error);
                            } else if (googleStatus?.configured && !googleStatus?.connected) {
                              toast.error("Connect your Google account first (link above) to generate a Meet link");
                            } else {
                              toast.error("No video-call provider is configured yet");
                            }
                          } catch {
                            toast.error("Failed to generate a video-call link");
                          } finally {
                            setGeneratingLink(false);
                          }
                          if (form.meetingType !== "video-call") handleChange("meetingType", "video-call");
                        }}
                        className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50"
                      >
                        <VideoIcon className="w-4 h-4" />
                        {generatingLink ? "Generating…" : "Generate Link"}
                      </button>
                    )}
                    </div>
                  </div>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => handleChange("location", e.target.value)}
                    className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 disabled:opacity-50"
                    placeholder="Meeting Room Address or video call link"
                    disabled={readOnly}
                  />
                </div>

                {/* Read-only company label — shown instead of the Entity
                    Type/record picker when the form is already scoped to a
                    single company. */}
                {initialCompanyId && companyName && (
                  <div>
                    <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Company</label>
                    <div className="w-full flex items-center gap-1.5 px-3 h-[38px] rounded-full border border-[#1F2937]/10 bg-[#F9F9FB] text-[13px] text-[#1F2937]">
                      <Building2 className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
                      <span className="truncate">{companyName}</span>
                    </div>
                  </div>
                )}

                {initialDealId && dealName && (
                  <div>
                    <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Deal</label>
                    <div className="w-full flex items-center gap-1.5 px-3 h-[38px] rounded-full border border-[#1F2937]/10 bg-[#F9F9FB] text-[13px] text-[#1F2937]">
                      <Building className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
                      <span className="truncate">{dealName}</span>
                    </div>
                  </div>
                )}

                {/* Same, for a contact-scoped meeting. */}
                {initialContactId && contactName && (
                  <div>
                    <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Contact</label>
                    <div className="w-full flex items-center gap-1.5 px-3 h-[38px] rounded-full border border-[#1F2937]/10 bg-[#F9F9FB] text-[13px] text-[#1F2937]">
                      <User className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
                      <span className="truncate">{contactName}</span>
                    </div>
                  </div>
                )}

                {/* Entity Type / related record — hidden when the form is
                    already scoped to a single company (opened from that
                    company's own Meetings tab), since picking one again
                    would be redundant. */}
                {!initialCompanyId && !initialContactId && !initialDealId && (
                  <div className="grid grid-cols-2 gap-4">
                    <div ref={linkedToRef}>
                      <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Entity Type</label>
                      <div className="relative">
                        <select
                          value={form.linkedTo}
                          onChange={(e) => handleChange("linkedTo", e.target.value)}
                          disabled={readOnly}
                          className="w-full appearance-none border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                        >
                          {entityTypeOptions.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#1F2937] opacity-50" />
                      </div>
                      {errors.linkedTo && <p className="text-red-500 text-xs mt-1 font-inter">{errors.linkedTo}</p>}
                    </div>

                    <div ref={entityRef}>
                      <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2 capitalize">
                        {form.linkedTo || "Record"}
                      </label>
                      <EntityPickerDropdown
                        entities={entityList}
                        value={getSelectedEntityId() || ""}
                        onChange={(val) =>
                          handleChange(
                            form.linkedTo === "contact"
                              ? "contactId"
                              : form.linkedTo === "vendor"
                                ? "vendorId"
                                : "companyId",
                            val
                          )
                        }
                        entityType={form.linkedTo || "company"}
                        disabled={readOnly}
                        isOpen={openDropdown === "entity"}
                        onOpenChange={(open) => setOpenDropdown(open ? "entity" : null)}
                      />
                      {errors.entity && <p className="text-red-500 text-xs mt-1 font-inter">{errors.entity}</p>}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {/* Meeting Category */}
                  <div>
                    <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Category</label>
                    <div className="relative">
                      <select
                        value={form.meetingCategory}
                        onChange={(e) => handleChange("meetingCategory", e.target.value)}
                        disabled={readOnly}
                        className="w-full appearance-none border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                      >
                        <option value="">— Select —</option>
                        {meetingTypes.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#1F2937] opacity-50" />
                    </div>
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Priority</label>
                    {/* Plain pill select, matching Category — no icon chips
                        or check marks. */}
                    <div className="relative">
                      <select
                        value={form.priority}
                        onChange={(e) => handleChange("priority", e.target.value)}
                        disabled={readOnly}
                        className="w-full appearance-none border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                      >
                        {priorityOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#1F2937] opacity-50" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {/* Date */}
                  <div ref={dateInputRef}>
                    <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Date</label>
                    <input
                      type="date"
                      value={form.date || calendarDate || ""}
                      min={new Date().toISOString().split("T")[0]}
                      onChange={(e) => handleChange("date", e.target.value)}
                      disabled={readOnly}
                      className={`w-full border rounded-full px-3 h-[38px] text-[13px] focus:outline-none focus:ring-1 transition-all cursor-pointer disabled:opacity-50 ${errors.date ? "border-red-500 focus:ring-red-500 text-red-600" : "border-[#1F2937]/10 focus:ring-blue-500 text-[#1F2937]"}`}
                    />
                    {errors.date && <p className="text-red-500 text-xs mt-1 font-inter">{errors.date}</p>}
                  </div>

                  {/* Time */}
                  <div>
                    <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Time</label>
                    <input
                      type="time"
                      value={form.time}
                      onChange={(e) => handleChange("time", e.target.value)}
                      disabled={readOnly}
                      className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer disabled:opacity-50"
                    />
                  </div>

                  {/* Duration */}
                  <div>
                    <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Duration</label>
                    <SingleSelectDropdown
                      options={durationOptions}
                      value={form.duration}
                      onChange={(val) => handleChange("duration", val)}
                      disabled={readOnly}
                      isOpen={openDropdown === "duration"}
                      onOpenChange={(open) => setOpenDropdown(open ? "duration" : null)}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="flex-1 h-px bg-[#D9D9D9]" />
                  <h3 className="flex-shrink-0 text-[14px] font-medium leading-[120%] text-[#1F2937]">
                    Participation
                  </h3>
                  <span className="flex-1 h-px bg-[#D9D9D9]" />
                </div>

                {/* Internal Team — your own staff attending, kept as a
                    separate list from Client Contacts below so Meeting
                    Details can actually tell the two apart instead of
                    lumping everyone under one bucket. */}
                <div>
                  <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Internal Team</label>
                  <MultiSelectDropdown
                    users={users}
                    selectedUsers={form.internalParticipants}
                    onSelectionChange={(internalParticipants) => handleChange("internalParticipants", internalParticipants)}
                    placeholder="Add internal team members"
                    isOpen={openDropdown === "internalTeam"}
                    onOpenChange={(open) => setOpenDropdown(open ? "internalTeam" : null)}
                  />
                </div>

                {/* Client Contacts — only a company has its own contact
                    list to pick from; a contact meeting IS the contact,
                    and vendors have no contacts in this model. */}
                {form.linkedTo === "company" && (
                  <div ref={participantsRef}>
                    <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Client Contacts</label>
                    <MultiSelectDropdown
                      users={companyContacts}
                      selectedUsers={form.participants}
                      onSelectionChange={(participants) => handleChange("participants", participants)}
                      placeholder={form.companyId ? "Add client contacts" : "Select a company first"}
                      isOpen={openDropdown === "clientContacts"}
                      onOpenChange={(open) => setOpenDropdown(open ? "clientContacts" : null)}
                    />
                    {errors.participants && <p className="text-red-500 text-xs mt-1 font-inter">{errors.participants}</p>}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <span className="flex-1 h-px bg-[#D9D9D9]" />
                  <h3 className="flex-shrink-0 text-[14px] font-medium leading-[120%] text-[#1F2937]">
                    Meeting Purpose
                  </h3>
                  <span className="flex-1 h-px bg-[#D9D9D9]" />
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Description</label>
                  <MeetingEditorStyles />
                  <div className="dc-meeting-editor quill-wrap">
                    <MeetingQuillToolbar />
                    <ReactQuill
                      theme="snow"
                      value={form.description}
                      onChange={(value) => handleChange("description", value)}
                      modules={quillModules}
                      formats={meetingQuillFormats}
                      placeholder="Describe the meeting objectives, requirements and important details"
                      readOnly={readOnly}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="flex-1 h-px bg-[#D9D9D9]" />
                  <h3 className="flex-shrink-0 text-[14px] font-medium leading-[120%] text-[#1F2937]">
                    Link
                  </h3>
                  <span className="flex-1 h-px bg-[#D9D9D9]" />
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Link Contact</label>
                  <EntityPickerDropdown
                    entities={companyContacts.length > 0 ? companyContacts : allContacts}
                    value={form.linkedContactId}
                    onChange={(val) => handleChange("linkedContactId", val)}
                    entityType="contact"
                    displayKey="name"
                    disabled={readOnly}
                    isOpen={openDropdown === "linkedContact"}
                    onOpenChange={(open) => setOpenDropdown(open ? "linkedContact" : null)}
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Link Deal</label>
                  <EntityPickerDropdown
                    entities={linkableDeals}
                    value={form.linkedDealId}
                    onChange={(val) => handleChange("linkedDealId", val)}
                    entityType="deal"
                    displayKey="title"
                    disabled={readOnly}
                    isOpen={openDropdown === "linkedDeal"}
                    onOpenChange={(open) => setOpenDropdown(open ? "linkedDeal" : null)}
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Link Invoice</label>
                  <EntityPickerDropdown
                    entities={linkableInvoices}
                    value={form.linkedInvoiceId}
                    onChange={(val) => handleChange("linkedInvoiceId", val)}
                    entityType="invoice"
                    displayKey="invoiceNumber"
                    disabled={readOnly}
                    isOpen={openDropdown === "linkedInvoice"}
                    onOpenChange={(open) => setOpenDropdown(open ? "linkedInvoice" : null)}
                  />
                </div>

                {meetingFieldDefs.length > 0 && (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="flex-1 h-px bg-[#D9D9D9]" />
                      <h3 className="flex-shrink-0 text-[14px] font-medium leading-[120%] text-[#1F2937]">
                        Custom Fields
                      </h3>
                      <span className="flex-1 h-px bg-[#D9D9D9]" />
                    </div>
                    <fieldset disabled={readOnly}>
                      <CustomFieldsSection
                        fieldDefs={meetingFieldDefs}
                        values={form.additionalFields}
                        errors={errors}
                        onChange={(next) => {
                          handleChange("additionalFields", next);
                          setErrors((prev) => {
                            const cleared = { ...prev };
                            next.forEach((f) => {
                              if (f.value !== undefined && f.value !== null && f.value.toString().trim() !== "") {
                                delete cleared[f.key];
                              }
                            });
                            return cleared;
                          });
                        }}
                        title=""
                      />
                    </fieldset>
                  </>
                )}

                {/* Conflict Alert */}
                {timeConflict && (
                  <TimeConflictAlert
                    conflict={timeConflict}
                    suggestedTimes={getSuggestedTimes()}
                    onTimeSelect={(time) => handleChange("time", time)}
                  />
                )}
              </div>
            </form>
          </div>

          {/* Footer Actions */}
          <div className="flex-shrink-0 py-2.5 px-4 border-t border-gray-100 bg-white flex items-center justify-between">
            <div>
              {mode === "view" && meetingData && onDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-red-500 hover:bg-red-50 border border-[#1F2937]/10 transition-colors"
                  title="Delete Meeting"
                >
                  <DeleteIcon className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors font-inter"
              >
                Cancel
              </button>
              {readOnly ? (
                <button
                  onClick={() => setIsEditMode(true)}
                  className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 transition-colors font-inter flex items-center gap-2"
                >
                  <EditIcon className="w-4 h-4" />
                  Edit Meeting
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={loading || timeConflict}
                  className={`px-6 py-2 rounded-[25px] text-sm font-bold transition-colors font-inter flex items-center gap-2 ${loading || timeConflict
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-[#158FFF] text-white hover:opacity-90"
                    }`}
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>{meetingData && mode === "view" ? "Save Changes" : "Schedule Meeting"}</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export { PriorityChip, MeetingTypeIcon, ParticipantChip };
export default AdminMeetingForm;
