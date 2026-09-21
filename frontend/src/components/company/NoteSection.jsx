import CalendarIcon from "../common/CalendarIcon";
import DeleteIcon from "../common/DeleteIcon";
import PlusIcon from "../common/PlusIcon";
import MoreIcon from "../common/MoreIcon";
import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import ReactQuill from "react-quill-new";
import "react-quill/dist/quill.snow.css";
import API from "../../services/api";
import { useParams } from "react-router-dom";
import toast from 'react-hot-toast';
import { getAncestorZoom } from "../../utils/domUtils";
import {
  ChevronDown,
  StickyNote,
  Users,
  X,
  Clock,
  Copy,
  Type,
  Flag,
  CheckCircle,
  Link2,
  Landmark,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Palette,
  Quote,
  Code,
  UserPlus
} from "lucide-react";
import AppToaster from "../AppToaster";
import { useSystemSettings } from "../../hooks/useSystemSettings";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";


import SearchIcon from "../common/SearchIcon";
import ListIcon from "../common/ListIcon";
import EyeIcon from "../common/EyeIcon";
import EditIcon from "../common/EditIcon";

// Same pill-trigger + rounded-xl checkmark-list popup used for Status/Priority
// on the Task form, instead of CustomDropdown's plain full-bleed list.
// Anchored directly under its own trigger via plain absolute positioning
// (not a portal) so it always opens exactly where it visually belongs; a
// max-height + internal scroll keeps it from ever growing large enough to
// need repositioning.
const NoteTypeDropdown = ({ options, value, onChange, onOpenChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const popupRef = useRef(null);

  // See EntityPickerDropdown below — tells the form to open up scroll room,
  // then scrolls the opened card fully into view.
  useEffect(() => {
    if (!isOpen) return;
    onOpenChange?.(true);
    const id = setTimeout(() => {
      popupRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 0);
    return () => {
      clearTimeout(id);
      onOpenChange?.(false);
    };
  }, [isOpen, onOpenChange]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-left flex items-center justify-between transition-all bg-white font-inter text-[#1F2937]"
      >
        <span className="truncate">{value}</span>
        <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div
            ref={popupRef}
            className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-1 max-h-[180px] overflow-y-auto animate-in fade-in zoom-in duration-200"
          >
            {options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-1.5 text-[13px] transition-colors hover:bg-gray-50 ${value === option ? "bg-blue-50/50 text-blue-600" : "text-gray-600"}`}
              >
                <span className="font-medium text-left flex-1">{option}</span>
                {value === option && <CheckCircle className="w-4 h-4 ml-auto text-blue-600" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// Searchable single-pick dropdown for the "Link Contact"/"Link Deal"/"Link
// Invoice" fields — matches the Task form's SearchableEntityDropdown (pill
// trigger, search box, capped list), anchored the same in-flow way as above.
const EntityPickerDropdown = ({ options, value, onChange, displayKey, placeholder, onOpenChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((o) => o._id === value);
  const filtered = options.filter((o) => (o[displayKey] || "").toLowerCase().includes(search.toLowerCase()));

  const popupRef = useRef(null);

  // While open, tell the form to add temporary bottom padding — otherwise a
  // dropdown on the last field has nowhere to scroll to and stays clipped.
  // Then scroll the popup itself (not the trigger) into view: "nearest"
  // moves the modal body by exactly enough to reveal the whole card.
  useEffect(() => {
    if (!isOpen) return;
    onOpenChange?.(true);
    const id = setTimeout(() => {
      popupRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 0);
    return () => {
      clearTimeout(id);
      onOpenChange?.(false);
    };
  }, [isOpen, onOpenChange]);

  const toggle = () => {
    setIsOpen((v) => !v);
    if (isOpen) setSearch("");
  };

  return (
    <div className="relative flex-1 min-w-0">
      <button
        type="button"
        onClick={toggle}
        className={`w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-left flex items-center justify-between gap-2 transition-all bg-white font-inter ${selected ? "text-[#1F2937]" : "text-[#1F2937] opacity-50"}`}
      >
        <span className="truncate">{selected ? selected[displayKey] : placeholder}</span>
        <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setIsOpen(false);
              setSearch("");
            }}
          />
          <div
            ref={popupRef}
            className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-gray-100 rounded-xl shadow-xl z-[10050] animate-in fade-in zoom-in duration-200"
          >
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#525866]" />
                <input
                  type="text"
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-8 pr-2 h-7 border border-gray-200 rounded-full text-[12px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            {/* Exactly 4 rows visible (~30px each incl. padding) — scrolls
                internally past that instead of growing the popup taller. */}
            <div className="max-h-[120px] overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-[12px] text-center text-gray-400">No results</p>
              ) : (
                filtered.map((o) => (
                  <button
                    key={o._id}
                    type="button"
                    onClick={() => {
                      onChange(o._id);
                      setIsOpen(false);
                      setSearch("");
                    }}
                    className={`w-full text-left px-3 py-1.5 text-[12px] truncate transition-colors hover:bg-gray-50 ${value === o._id ? "bg-blue-50/50 text-blue-600" : "text-gray-700"}`}
                  >
                    {o[displayKey]}
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

const QuillToolbar = () => (
  <div id="toolbar" className="flex flex-wrap items-center gap-1 p-2 bg-white border-b border-gray-300 rounded-t-2xl">
    <div className="flex gap-0.5 pr-1.5">
      <button className="ql-header w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" value="1">
        <Heading1 className="w-4 h-4" />
      </button>
      <button className="ql-header w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" value="2">
        <Heading2 className="w-4 h-4" />
      </button>
      <button className="ql-header w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" value="3">
        <Heading3 className="w-4 h-4" />
      </button>
      <button className="ql-header w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" value="4">
        <Heading4 className="w-4 h-4" />
      </button>
    </div>

    <div className="flex gap-0.5 px-1.5">
      <button className="ql-bold w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
        <Bold className="w-4 h-4" />
      </button>
      <button className="ql-italic w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
        <Italic className="w-4 h-4" />
      </button>
      <button className="ql-underline w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
        <Underline className="w-4 h-4" />
      </button>
      <button className="ql-strike w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
        <Strikethrough className="w-4 h-4" />
      </button>
    </div>

    <div className="flex gap-0.5 px-1.5">
      <button className="ql-list w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" value="ordered">
        <ListOrdered className="w-4 h-4" />
      </button>
      <button className="ql-list w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" value="bullet">
        <ListIcon className="w-4 h-4" />
      </button>
      <button className="ql-indent w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" value="-1">
        <AlignLeft className="w-4 h-4" />
      </button>
      <button className="ql-indent w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" value="+1">
        <AlignRight className="w-4 h-4" />
      </button>
    </div>

    <div className="flex gap-0.5 px-1.5">
      <button className="ql-align w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" value="">
        <AlignLeft className="w-4 h-4" />
      </button>
      <button className="ql-align w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" value="center">
        <AlignCenter className="w-4 h-4" />
      </button>
      <button className="ql-align w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" value="right">
        <AlignRight className="w-4 h-4" />
      </button>
      <button className="ql-align w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors" value="justify">
        <AlignJustify className="w-4 h-4" />
      </button>
    </div>

    <div className="flex gap-0.5 pl-1.5">
      <button className="ql-link w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
        <Link2 className="w-4 h-4" />
      </button>
      <button className="ql-blockquote w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
        <Quote className="w-4 h-4" />
      </button>
      <button className="ql-code-block w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
        <Code className="w-4 h-4" />
      </button>
      <button className="ql-clean w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
        <Type className="w-4 h-4" />
      </button>
    </div>
  </div>
);

// Global styles for the Quill editor/viewer. Rendered by whichever
// component (NoteEditor, NoteViewer, or the embedded NoteSection) mounts
// first — it must NOT live only inside NoteSection's own render tree, since
// NoteEditor/NoteViewer are also used standalone (e.g. from
// CompanyNotesTab.jsx) without NoteSection ever mounting.
const NoteStyles = () => (
  <style jsx global>{`
    /* Premium Note Editor Styles */
    .quill,
    .ql-toolbar.ql-snow,
    .ql-container.ql-snow,
    .ql-editor {
      border: none !important;
    }

    .ql-toolbar.ql-snow {
      padding: 0.5rem !important;
      border-bottom: 1px solid #d1d5db !important;
    }

    .ql-container.ql-snow {
      font-family: inherit !important;
      border-bottom-left-radius: 1rem !important;
      border-bottom-right-radius: 1rem !important;
    }

    .ql-editor {
      padding: 2rem !important;
      min-height: 400px !important;
      font-size: 1rem !important;
      line-height: 1.8 !important;
      color: #374151 !important;
      border-bottom-left-radius: 1rem !important;
      border-bottom-right-radius: 1rem !important;
    }

    /* Compact variant for the create/edit form — the 400px default is sized
       for the full-page note viewer, not this modal, which should open small
       and grow with the note's actual content. */
    .dc-note-editor-compact .ql-editor {
      padding: 1rem !important;
      min-height: 160px !important;
    }

    .ql-editor.ql-blank::before {
      left: 2rem !important;
      color: #9ca3af !important;
      font-style: normal !important;
      font-weight: 500 !important;
    }

    /* Toolbar Button Overrides */
    #toolbar button {
      border: none !important;
      color: #6b7280 !important;
      transition: all 0.2s !important;
    }

    #toolbar button:hover {
      background-color: #f9fafb !important;
      color: #111827 !important;
    }

    #toolbar button.ql-active {
      background-color: #eff6ff !important;
      color: #2563eb !important;
    }

    #toolbar .ql-stroke {
      stroke: currentColor !important;
    }

    #toolbar .ql-fill {
      fill: currentColor !important;
    }

    /* Typography */
    .ql-editor h1 {
      font-size: 2.25rem !important;
      font-weight: 800 !important;
      margin-bottom: 1rem !important;
      border-bottom: none !important;
    }
    .ql-editor h2 {
      font-size: 1.875rem !important;
      font-weight: 700 !important;
      margin-bottom: 0.75rem !important;
      border-bottom: none !important;
    }
    .ql-editor h3 {
      font-size: 1.5rem !important;
      font-weight: 600 !important;
      margin-bottom: 0.5rem !important;
      border-bottom: none !important;
    }
    .ql-editor p {
      margin-bottom: 1.25rem !important;
    }

    /* List Styling */
    .ql-editor ol,
    .ql-editor ul {
      padding-left: 1.5rem !important;
      margin-bottom: 1.25rem !important;
    }

    .ql-editor li {
      margin-bottom: 0.5rem !important;
    }

    /* Prose styles for viewer */
    .prose h1 {
      font-size: 2rem;
      font-weight: 800;
      color: #111827;
      margin-bottom: 0.5rem;
    }
    .prose h2 {
      font-size: 1.5rem;
      font-weight: 700;
      color: #111827;
      margin-bottom: 0.5rem;
    }
    .prose p {
      line-height: 1.8;
      color: #374151;
      margin-bottom: 1rem;
    }
    .prose a,
    .ql-editor a {
      color: #2563eb;
      text-decoration: underline;
    }
  `}</style>
);

// Base Quill modules/formats config, shared by every editor instance. The
// "link" handler is patched per-instance in NoteEditor (see linkModalRef
// below) so it can open our own styled dialog instead of window.prompt().
const baseQuillModules = {
  toolbar: {
    container: "#toolbar",
  },
  clipboard: {
    matchVisual: false,
  }
};

const quillFormats = [
  'header', 'bold', 'italic', 'underline', 'strike',
  'list', 'indent', 'align', 'link', 'blockquote', 'code-block'
];


// NoteViewer component
export const NoteViewer = ({ isOpen, onClose, note, onEdit, onDelete }) => {
  const [isSliding, setIsSliding] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => setIsSliding(true), 10);
    } else {
      setIsSliding(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [isOpen]);

  if (!shouldRender || !note) return null;

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    return date.toLocaleString([], {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const relativeTime = (dateString) => {
    if (!dateString) return "—";
    const diffMs = Date.now() - new Date(dateString).getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  };

  const noteId = `NOTE-${(note._id || "").slice(-5).toUpperCase()}`;
  const authorName = typeof note.user === "object" ? note.user?.name || "Unknown" : "Unknown";
  const authorRole = typeof note.user === "object" ? note.user?.role || "" : "";
  const authorAvatar = typeof note.user === "object"
    ? note.user?.profileUrl || note.user?.userData?.mainData?.profilePic
    : null;
  const primaryContact = note.taggedContacts?.[0];

  const handleSave = () => {
    onClose();
    onEdit?.(note);
  };

  const handleMarkComplete = () => {
    toast("Mark as complete isn't available yet");
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300"
        style={{ opacity: isSliding ? 1 : 0 }}
        onClick={onClose}
      />
      <div
        className={`fixed dc-panel-card z-[10001] w-[min(90vw,560px)] bg-white shadow-2xl flex flex-col overflow-hidden transform transition-transform duration-300 font-inter ${
          isSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex flex-row justify-between items-center flex-shrink-0"
          style={{ padding: "23px 24px", gap: 10, height: 55 }}
        >
          <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 14, lineHeight: "20px", color: "#78788D" }}>
            {noteId}
          </span>
          <div className="flex flex-row items-center justify-end" style={{ gap: 4 }}>
            <button
              onClick={handleSave}
              className="p-1 rounded-lg hover:bg-blue-50 transition-colors"
              title="Edit"
            >
              <EditIcon className="w-5 h-5" style={{ color: "#0085FF" }} />
            </button>
            <button
              onClick={() => onDelete?.(note._id)}
              className="p-1 rounded-lg hover:bg-red-50 transition-colors"
              title="Delete"
            >
              <DeleteIcon className="w-4 h-4" style={{ color: "#F60000" }} />
            </button>
            <div style={{ width: 1, height: 18, backgroundColor: "rgba(28, 27, 31, 0.3)" }} />
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" style={{ color: "#1C1B1F" }} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-3">
          <div className="flex flex-col items-start" style={{ padding: 24, gap: 14 }}>
            <div className="flex flex-col items-start w-full" style={{ gap: 6 }}>
              <div className="flex flex-row items-center justify-between w-full" style={{ gap: 40 }}>
                <h1
                  style={{
                    fontFamily: "Inter",
                    fontWeight: 500,
                    fontSize: 16,
                    lineHeight: "120%",
                    letterSpacing: "-0.5px",
                    color: "#0E121B",
                  }}
                  className="truncate"
                >
                  {note.title || 'Untitled Note'}
                </h1>
                <span
                  className="flex-shrink-0 inline-flex items-center justify-center"
                  style={{
                    padding: "4px 8px",
                    borderRadius: 35,
                    backgroundColor: "#EEE7FD",
                    fontFamily: "Inter",
                    fontWeight: 500,
                    fontSize: 12,
                    lineHeight: "120%",
                    color: "#CB30E0",
                    whiteSpace: "nowrap",
                  }}
                >
                  {note.noteType || "General Note"}
                </span>
              </div>
              <div className="flex flex-row items-center w-full" style={{ gap: 6 }}>
                {authorAvatar ? (
                  <img
                    src={authorAvatar}
                    alt={authorName}
                    className="rounded-full object-cover flex-shrink-0"
                    style={{ width: 16, height: 16 }}
                  />
                ) : (
                  <div
                    className="rounded-full bg-gray-200 flex items-center justify-center text-[8px] font-semibold text-gray-600 flex-shrink-0"
                    style={{ width: 16, height: 16 }}
                  >
                    {authorName?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                )}
                <span
                  className="truncate"
                  style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 12, lineHeight: "120%", color: "#525866" }}
                >
                  Created by {authorName} on {formatDate(note.createdAt)} • Updated {relativeTime(note.updatedAt || note.createdAt)}
                </span>
              </div>
            </div>
          </div>

          {/* Note Information */}
          <div className="flex flex-col items-start w-full" style={{ padding: "12px 24px", gap: 14 }}>
            <p style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
              Note Information
            </p>
            <div
              className="flex flex-col items-start w-full"
              style={{ padding: 14, gap: 16, backgroundColor: "#F8FAFC", borderRadius: 14 }}
            >
              <div className="flex flex-row items-start w-full" style={{ gap: 16 }}>
                <div className="flex flex-col items-start flex-1" style={{ gap: 6 }}>
                  <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#6B7280" }}>
                    Meeting
                  </span>
                  <span
                    className="truncate"
                    style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#0085FF" }}
                  >
                    —
                  </span>
                </div>
                <div className="flex flex-col items-start flex-1" style={{ gap: 6 }}>
                  <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#6B7280" }}>
                    Deal
                  </span>
                  <span
                    className="truncate"
                    style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#0085FF" }}
                  >
                    {note.company?.name || "—"}
                  </span>
                </div>
              </div>
              <div className="flex flex-row items-start w-full" style={{ gap: 16 }}>
                <div className="flex flex-col items-start flex-1" style={{ gap: 6 }}>
                  <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#6B7280" }}>
                    Tasks
                  </span>
                  <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#1C1C1D" }}>
                    {note.tasks?.length || 0} Tasks
                  </span>
                </div>
                <div className="flex flex-col items-start flex-1" style={{ gap: 6 }}>
                  <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#6B7280" }}>
                    Invoices
                  </span>
                  <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
                    {note.invoices?.length || 0} Invoices
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Details */}
          <div
            className="flex flex-row justify-between items-center w-full"
            style={{ padding: "12px 24px", gap: 14 }}
          >
            <p style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
              Details
            </p>
            <button
              onClick={handleSave}
              className="flex items-center justify-center hover:bg-blue-50 rounded-md transition-all flex-shrink-0"
              style={{ width: 20, height: 20 }}
              title="Edit details"
            >
              <EditIcon className="w-4 h-4" style={{ color: "#0085FF" }} />
            </button>
          </div>

          <div
            className="box-border flex flex-col items-start w-full"
            style={{ padding: "16px 24px", gap: 16 }}
          >
            <div className="flex flex-row items-start w-full" style={{ gap: 16 }}>
              <div className="flex flex-col items-start flex-1" style={{ gap: 6 }}>
                <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#6B7280" }}>
                  Note Type
                </span>
                <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#0085FF" }}>
                  {note.noteType || "General Note"}
                </span>
              </div>
              <div className="flex flex-col items-start flex-1" style={{ gap: 6 }}>
                <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#6B7280" }}>
                  Visibility
                </span>
                <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#0085FF" }}>
                  {note.visibility || "Team"}
                </span>
              </div>
            </div>
            <div className="flex flex-row items-start w-full" style={{ gap: 16 }}>
              <div className="flex flex-col items-start flex-1" style={{ gap: 6 }}>
                <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#6B7280" }}>
                  Author
                </span>
                <div className="flex flex-row items-center" style={{ gap: 12 }}>
                  {authorAvatar ? (
                    <img
                      src={authorAvatar}
                      alt={authorName}
                      className="rounded-full object-cover flex-shrink-0"
                      style={{ width: 32, height: 32 }}
                    />
                  ) : (
                    <div
                      className="rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 flex-shrink-0"
                      style={{ width: 32, height: 32 }}
                    >
                      {authorName?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                  )}
                  <div className="flex flex-col items-start" style={{ gap: 4 }}>
                    <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#1F2937" }} className="truncate">
                      {authorName}
                    </span>
                    <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#6B7280" }} className="truncate">
                      {authorRole || "—"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-start flex-1" style={{ gap: 6 }}>
                <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 12, lineHeight: "120%", color: "#6B7280" }}>
                  Last Updated
                </span>
                <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
                  {formatDate(note.updatedAt || note.createdAt)}
                </span>
              </div>
            </div>
          </div>

          <div style={{ margin: "0 24px", borderBottom: "1px solid #D9D9D9" }} />

          {/* Note content */}
          <div
            className="box-border flex flex-col items-start w-full"
            style={{ padding: "12px 24px" }}
          >
            <div
              className="flex flex-col items-start justify-center w-full"
              style={{ padding: 14, gap: 16, backgroundColor: "#F8FAFC", borderRadius: 14 }}
            >
              <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
                Note
              </span>
              <div
                className="ql-editor prose prose-sm max-w-none w-full"
                style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 12, lineHeight: "120%", color: "#1F2937", padding: 0 }}
              >
                <div dangerouslySetInnerHTML={{ __html: note.note }} />
              </div>
            </div>
          </div>

          {/* Linked Records */}
          <div className="box-border flex flex-col items-start w-full" style={{ padding: "12px 24px", gap: 14 }}>
            <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
              Linked Records
            </span>
            <div
              className="flex flex-col items-start w-full"
              style={{ padding: 14, gap: 16, backgroundColor: "#F8FAFC", borderRadius: 14 }}
            >
              {/* Row 1: Contact / Deal */}
              <div className="flex flex-row justify-between items-center w-full" style={{ gap: 16 }}>
                <div className="flex flex-row items-center flex-1 min-w-0" style={{ gap: 12 }}>
                  {primaryContact?.avatar ? (
                    <img
                      src={primaryContact.avatar}
                      alt={primaryContact.name}
                      className="rounded-full object-cover flex-shrink-0"
                      style={{ width: 32, height: 32 }}
                    />
                  ) : (
                    <div
                      className="rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 flex-shrink-0"
                      style={{ width: 32, height: 32 }}
                    >
                      {primaryContact?.name?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                  )}
                  <div className="flex flex-col items-start min-w-0" style={{ gap: 4 }}>
                    <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 10, lineHeight: "120%", color: "#6B7280" }}>
                      Contact
                    </span>
                    <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#1F2937" }} className="truncate">
                      {primaryContact?.name || "—"}
                    </span>
                    <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 8, lineHeight: "120%", color: "#6B7280" }} className="truncate">
                      {primaryContact?.role || "—"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-row items-center flex-1 min-w-0" style={{ gap: 12 }}>
                  <div
                    className="rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ width: 32, height: 32, backgroundColor: "rgba(212, 170, 0, 0.1)" }}
                  >
                    <svg width="17" height="16" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1.66667 15.8333C1.20833 15.8333 0.815972 15.6701 0.489583 15.3438C0.163194 15.0174 0 14.625 0 14.1667V5C0 4.54167 0.163194 4.14931 0.489583 3.82292C0.815972 3.49653 1.20833 3.33333 1.66667 3.33333H5V1.66667C5 1.20833 5.16319 0.815972 5.48958 0.489583C5.81597 0.163194 6.20833 0 6.66667 0H10C10.4583 0 10.8507 0.163194 11.1771 0.489583C11.5035 0.815972 11.6667 1.20833 11.6667 1.66667V3.33333H15C15.4583 3.33333 15.8507 3.49653 16.1771 3.82292C16.5035 4.14931 16.6667 4.54167 16.6667 5V14.1667C16.6667 14.625 16.5035 15.0174 16.1771 15.3438C15.8507 15.6701 15.4583 15.8333 15 15.8333H1.66667ZM1.66667 14.1667H15V5H1.66667V14.1667ZM6.66667 3.33333H10V1.66667H6.66667V3.33333Z" fill="#D4AA00"/>
                    </svg>
                  </div>
                  <div className="flex flex-col items-start min-w-0" style={{ gap: 4 }}>
                    <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 10, lineHeight: "120%", color: "#6B7280" }}>
                      Deal
                    </span>
                    <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#0085FF" }} className="truncate">
                      {note.company?.name || "—"}
                    </span>
                    <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 8, lineHeight: "120%", color: "#6B7280" }} className="truncate">
                      —
                    </span>
                  </div>
                </div>
              </div>

              {/* Row 2: Meeting / Invoice */}
              <div className="flex flex-row justify-between items-center w-full" style={{ gap: 16 }}>
                <div className="flex flex-row items-center flex-1 min-w-0" style={{ gap: 12 }}>
                  <div
                    className="rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ width: 32, height: 32, backgroundColor: "rgba(0, 133, 255, 0.1)" }}
                  >
                    <svg width="17" height="14" viewBox="0 0 17 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3.33333 10H10V9.54167C10 8.93056 9.69444 8.4375 9.08333 8.0625C8.47222 7.6875 7.66667 7.5 6.66667 7.5C5.66667 7.5 4.86111 7.6875 4.25 8.0625C3.63889 8.4375 3.33333 8.93056 3.33333 9.54167V10ZM6.66667 6.66667C7.125 6.66667 7.51736 6.50347 7.84375 6.17708C8.17014 5.85069 8.33333 5.45833 8.33333 5C8.33333 4.54167 8.17014 4.14931 7.84375 3.82292C7.51736 3.49653 7.125 3.33333 6.66667 3.33333C6.20833 3.33333 5.81597 3.49653 5.48958 3.82292C5.16319 4.14931 5 4.54167 5 5C5 5.45833 5.16319 5.85069 5.48958 6.17708C5.81597 6.50347 6.20833 6.66667 6.66667 6.66667ZM1.66667 13.3333C1.20833 13.3333 0.815972 13.1701 0.489583 12.8438C0.163194 12.5174 0 12.125 0 11.6667V1.66667C0 1.20833 0.163194 0.815972 0.489583 0.489583C0.815972 0.163194 1.20833 0 1.66667 0H11.6667C12.125 0 12.5174 0.163194 12.8438 0.489583C13.1701 0.815972 13.3333 1.20833 13.3333 1.66667V5.41667L16.6667 2.08333V11.25L13.3333 7.91667V11.6667C13.3333 12.125 13.1701 12.5174 12.8438 12.8438C12.5174 13.1701 12.125 13.3333 11.6667 13.3333H1.66667ZM1.66667 11.6667H11.6667V1.66667H1.66667V11.6667Z" fill="#0085FF"/>
                    </svg>
                  </div>
                  <div className="flex flex-col items-start min-w-0" style={{ gap: 4 }}>
                    <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 10, lineHeight: "120%", color: "#6B7280" }}>
                      Meeting
                    </span>
                    <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#0085FF" }} className="truncate">
                      —
                    </span>
                    <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 8, lineHeight: "120%", color: "#6B7280" }} className="truncate">
                      —
                    </span>
                  </div>
                </div>
                <div className="flex flex-row items-center flex-1 min-w-0" style={{ gap: 12 }}>
                  <div
                    className="rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ width: 32, height: 32, backgroundColor: "rgba(97, 85, 245, 0.1)" }}
                  >
                    <Landmark className="w-5 h-5" style={{ color: "#6155F5" }} />
                  </div>
                  <div className="flex flex-col items-start min-w-0" style={{ gap: 4 }}>
                    <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 10, lineHeight: "120%", color: "#6B7280" }}>
                      Invoice
                    </span>
                    <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#0085FF" }} className="truncate">
                      —
                    </span>
                    <span style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 10, lineHeight: "120%", color: "#6B7280" }} className="truncate">
                      —
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid #E5E7EB" }} />
        <div style={{ borderTop: "1px solid #E5E7EB" }} />

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-4 flex-shrink-0">
          <button
            onClick={handleMarkComplete}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-green-200 text-green-600 text-xs font-medium hover:bg-green-50 transition-colors"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Mark As Complete
          </button>
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-full border border-red-200 text-red-500 text-xs font-medium hover:bg-red-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="ml-auto px-4 py-2 rounded-full bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
      <NoteStyles />
    </>
  );
};
// Force Vite HMR re-parse


// NoteCard component
export const NoteCard = ({ note, onEdit, onDelete, onView, onDuplicate }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const menuBtnRef = useRef(null);
  const formatFullDate = (dateString) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString([], {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.abs(now - date) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 168) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const [isExpanded, setIsExpanded] = useState(false);

  const getPreviewText = (html, expand = false) => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const text = tempDiv.textContent || tempDiv.innerText || '';
    if (expand) return text;
    return text.length > 150 ? text.substring(0, 150) + '...' : text;
  };

  const rawText = getPreviewText(note.note, true);
  const isLong = rawText.length > 150;

  return (
    <div
      className="bg-white hover:border-blue-200 transition-all group relative flex flex-col items-start overflow-hidden"
      style={{
        width: "100%",
        borderRadius: 12,
        border: "1px solid #F3F4F6",
        boxShadow: "0px 0px 6px rgba(0, 0, 0, 0.02), 0px 2px 4px rgba(0, 0, 0, 0.08)",
      }}
    >
      <div
        className="relative w-full flex-shrink-0"
        style={{
          height: 70,
          background: "linear-gradient(180deg, #C7E4FF 0%, #FFFFFF 100%)",
        }}
      >
        <svg width="61" height="61" viewBox="0 0 61 61" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ position: "absolute", left: 7, top: 5 }}>
          <path d="M58.0872 23.5066L53.5122 28.0816V17.2H32.9247V28.6375H21.4872V53.8H53.5122V47.4934L58.0872 42.9184V56.1058C58.0866 56.7078 57.847 57.285 57.4211 57.7105C56.9951 58.136 56.4177 58.375 55.8157 58.375H19.1837C18.8833 58.3729 18.5862 58.3117 18.3095 58.1948C18.0327 58.0779 17.7817 57.9076 17.5708 57.6937C17.3599 57.4798 17.1932 57.2264 17.0801 56.9481C16.9671 56.6698 16.9101 56.3719 16.9122 56.0715V26.35L30.644 12.625H55.7951C57.0578 12.625 58.0872 13.6658 58.0872 14.8942V23.5066ZM59.8668 28.196L63.1014 31.4328L45.3092 49.225L42.0701 49.2204L42.0747 45.9905L59.8668 28.1983V28.196Z" fill="url(#noteCardIconGradient)" />
          <defs>
            <linearGradient id="noteCardIconGradient" x1="41.7768" y1="12.625" x2="41.7768" y2="58.375" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0085FF" />
              <stop offset="0.95343" stopColor="white" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div
        className="flex flex-col items-start w-full flex-1"
        style={{ padding: "10px 16px 16px" }}
      >
        <div className="flex flex-col items-start w-full" style={{ gap: 14 }}>
          <div className="flex flex-col items-start w-full" style={{ gap: 12 }}>
            <div className="flex items-start justify-between gap-2 w-full">
              <h4
                className="line-clamp-2"
                style={{
                  fontFamily: "Inter",
                  fontWeight: 500,
                  fontSize: 14,
                  lineHeight: "120%",
                  color: "#0F141A",
                }}
              >
                {note.title || 'Untitled Note'}
              </h4>
            </div>

            <div className="flex items-center" style={{ gap: 12 }}>
              <div className="flex items-center" style={{ gap: 4 }}>
                <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 12, lineHeight: "120%", color: "#0085FF" }}>
                  Document Note
                </span>
                <CalendarIcon style={{ width: 12, height: 12, color: "#868C98" }} />
              </div>
              <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 12, lineHeight: "120%", color: "#525866" }}>
                {formatFullDate(note.createdAt)}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-start w-full gap-2">
            <p
              className={`w-full ${isExpanded ? "" : "line-clamp-3"}`}
              style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 12, lineHeight: "160%", color: "#525866" }}
            >
              {getPreviewText(note.note, isExpanded)}
            </p>
            {isLong && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-blue-600 hover:text-blue-800 text-xs font-semibold transition-colors mt-1"
              >
                {isExpanded ? "Show Less" : "Read More"}
              </button>
            )}
          </div>
        </div>

        <div
          className="flex items-center justify-between w-full mt-auto"
          style={{ paddingTop: 20 }}
        >
          <div className="flex items-center" style={{ gap: 12 }}>
            {(() => {
              const authorUser = typeof note.user === "object" ? note.user : null;
              const authorAvatar = authorUser?.profileUrl || authorUser?.userData?.mainData?.profilePic;
              return authorAvatar ? (
                <img
                  src={authorAvatar}
                  alt={authorUser?.name || "User"}
                  className="rounded-full object-cover flex-shrink-0"
                  style={{ width: 20, height: 20 }}
                />
              ) : (
                <div
                  className="rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-semibold text-gray-600 flex-shrink-0"
                  style={{ width: 20, height: 20 }}
                >
                  {authorUser?.name?.charAt(0)?.toUpperCase() || "?"}
                </div>
              );
            })()}
            <div className="flex items-center" style={{ gap: 6 }}>
              <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, lineHeight: "120%", color: "#1F2937" }}>
                {typeof note.user === "object" ? note.user?.name || "Unknown" : "Unknown"}
              </span>
              <span
                className="inline-flex items-center justify-center rounded-full"
                style={{
                  padding: "4px 8px",
                  background: "rgba(28, 28, 29, 0.1)",
                  fontFamily: "Inter",
                  fontWeight: 500,
                  fontSize: 8,
                  lineHeight: "120%",
                  color: "#1C1C1D",
                }}
              >
                {note.createdAt ? new Date(note.createdAt).getFullYear() : ""}
              </span>
            </div>
          </div>
          <div className="relative flex-shrink-0" onMouseDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              ref={menuBtnRef}
              onClick={(e) => {
                e.stopPropagation();
                if (menuOpen) {
                  setMenuOpen(false);
                  setMenuPos(null);
                  return;
                }
                const zMenu = getAncestorZoom(document.body);
                const MENU_W = 160;
                const MENU_H = onDuplicate ? 148 : 110;
                const MARGIN = 8;
                const rect = e.currentTarget.getBoundingClientRect();
                const viewportH = window.innerHeight / zMenu;
                const viewportW = window.innerWidth / zMenu;
                let calcTop = rect.bottom / zMenu + 4;
                calcTop = Math.max(MARGIN, Math.min(calcTop, viewportH - MENU_H - MARGIN));
                let calcLeft = rect.right / zMenu - MENU_W;
                calcLeft = Math.min(calcLeft, viewportW - MENU_W - MARGIN);
                calcLeft = Math.max(calcLeft, MARGIN);
                setMenuPos({ top: calcTop, left: calcLeft });
                setMenuOpen(true);
              }}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
              title="More options"
            >
              <MoreIcon className="w-4 h-4 text-[#1C1B1F]" />
            </button>

            {menuOpen && menuPos && createPortal(
              <>
                <div className="fixed inset-0 z-[9998]" onClick={() => { setMenuOpen(false); setMenuPos(null); }} />
                <div
                  style={{ position: "fixed", top: menuPos.top, left: menuPos.left }}
                  className="w-[160px] z-[9999] bg-white border border-[#E5E5EC] rounded-lg shadow-[7px_24px_24px_-7px_rgba(0,0,0,0.25)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in duration-150 origin-top-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => { setMenuOpen(false); setMenuPos(null); onView(note); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                  >
                    <EyeIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                    View Note
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); setMenuPos(null); onEdit(note); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                  >
                    <EditIcon className="w-3.5 h-3.5 text-[#1C1B1F]" />
                    Edit Note
                  </button>
                  {onDuplicate && (
                    <button
                      onClick={() => { setMenuOpen(false); setMenuPos(null); onDuplicate(note); }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-normal text-[#161618] hover:bg-gray-50 whitespace-nowrap"
                    >
                      <Copy className="w-3.5 h-3.5 text-[#1C1B1F]" />
                      Duplicate Note
                    </button>
                  )}
                  <div className="w-full border-t border-[#F1F1F5] my-0.5" />
                  <button
                    onClick={() => { setMenuOpen(false); setMenuPos(null); onDelete(note._id); }}
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
        </div>
      </div>
    </div>
  );
};


// NoteEditor component
export const NoteEditor = ({
  isOpen,
  onClose,
  noteTitle,
  setNoteTitle,
  noteContent,
  setNoteContent,
  taggedContacts,
  setTaggedContacts,
  contacts,
  deals = [],
  invoices = [],
  noteType,
  setNoteType,
  visibility,
  setVisibility,
  onSave,
  onDelete,
  loading,
  isEditing,
  noteTypes = ["General Note", "Meeting Note", "Call Note", "Follow-up Note"]
}) => {
  const [isSliding, setIsSliding] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkModalUrl, setLinkModalUrl] = useState("");
  const [contactToAdd, setContactToAdd] = useState("");
  const [taggedDeals, setTaggedDeals] = useState([]);
  const [dealToAdd, setDealToAdd] = useState("");
  const [taggedInvoices, setTaggedInvoices] = useState([]);
  const [invoiceToAdd, setInvoiceToAdd] = useState("");
  const pendingLinkRef = useRef({ quill: null, range: null });

  // Extra scroll room is only added while a dropdown is actually open, so the
  // form doesn't sit with a big empty gap under its last field the rest of
  // the time. Counted rather than a boolean so overlapping open/close
  // transitions can't leave it stuck on.
  const [openDropdowns, setOpenDropdowns] = useState(0);
  const handleDropdownOpenChange = useCallback((open) => {
    setOpenDropdowns((n) => Math.max(0, n + (open ? 1 : -1)));
  }, []);

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => setIsSliding(true), 10);
    } else {
      setIsSliding(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [isOpen]);

  // Lock the page behind the backdrop so it can't be scrolled while this
  // overlay is open.
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  const quillModules = useMemo(() => ({
    ...baseQuillModules,
    toolbar: {
      ...baseQuillModules.toolbar,
      handlers: {
        // Quill's default link handler silently no-ops when nothing is
        // selected — open our own styled dialog either way, inserting the
        // URL as the link text when there's no selection to format.
        link(value) {
          if (!value) {
            this.quill.format('link', false);
            return;
          }
          pendingLinkRef.current = { quill: this.quill, range: this.quill.getSelection(true) };
          setLinkModalUrl("");
          setLinkModalOpen(true);
        }
      }
    }
  }), []);

  const confirmInsertLink = () => {
    const suffix = linkModalUrl.trim();
    const { quill, range } = pendingLinkRef.current;
    if (suffix && quill && range) {
      const url = `https://${suffix}`;
      if (range.length === 0) {
        quill.insertText(range.index, url, 'link', url, 'user');
        quill.setSelection(range.index + url.length, 0, 'user');
      } else {
        quill.format('link', url);
      }
    }
    setLinkModalOpen(false);
  };

  if (!shouldRender) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-all duration-300"
        style={{ opacity: isSliding ? 1 : 0 }}
        onClick={onClose}
      />
      <div className={`fixed dc-panel-card dc-panel-w z-[10001] bg-white shadow-2xl overflow-hidden flex flex-col transform transition-transform duration-300 ease-out font-inter ${isSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}`}>
        {/* Sticky header — matches the CompanyForm/TaskForm header spec */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
          <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
            {isEditing ? 'Edit Note' : 'Create New Note'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="w-5 h-5 flex items-center justify-center text-[#1C1B1F] hover:opacity-70 transition-opacity"
            aria-label="Close"
          >
            <X className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onSave(); }} className="flex flex-col min-h-0 flex-1">
          {/* Scrollable body */}
          {/* The extra bottom padding only appears while a dropdown is open,
              giving it somewhere to scroll to; otherwise the form would sit
              with a large empty gap under its last field. */}
          <div
            className={`px-8 pt-6 space-y-6 overflow-y-auto min-h-0 flex-1 transition-[padding] duration-200 ${
              openDropdowns > 0 ? "pb-52" : "pb-6"
            }`}
          >
            <div>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Note Title <span className="text-[#FF4935]">*</span>
              </label>
              <input
                type="text"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Enter Note Title"
                className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50"
                autoFocus
              />
            </div>

            {/* Editor Area */}
            <div>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Note <span className="text-[#FF4935]">*</span>
              </label>
              <div className="border border-[#1F2937]/10 rounded-2xl overflow-hidden dc-note-editor-compact">
                <QuillToolbar />
                <ReactQuill
                  value={noteContent}
                  onChange={setNoteContent}
                  modules={quillModules}
                  formats={quillFormats}
                  theme="snow"
                  placeholder="Start writing your note..."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                  Note Type <span className="text-[#FF4935]">*</span>
                </label>
                <NoteTypeDropdown
                  options={noteTypes}
                  value={noteType}
                  onChange={setNoteType}
                  onOpenChange={handleDropdownOpenChange}
                />
              </div>

              <div>
                <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                  Visibility <span className="text-[#FF4935]">*</span>
                </label>
                <NoteTypeDropdown
                  options={["Team", "Private"]}
                  value={visibility}
                  onChange={setVisibility}
                  onOpenChange={handleDropdownOpenChange}
                />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Link Contact
              </label>
              <div className="flex items-center gap-3">
                <EntityPickerDropdown
                  options={contacts}
                  value={contactToAdd}
                  onChange={setContactToAdd}
                  displayKey="name"
                  placeholder="Choose Contact"
                  onOpenChange={handleDropdownOpenChange}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!contactToAdd) return;
                    const contact = contacts.find((c) => c._id === contactToAdd);
                    if (!contact) return;
                    if (!taggedContacts.some((tc) => tc.value === contact._id)) {
                      setTaggedContacts([...taggedContacts, { label: contact.name, value: contact._id }]);
                    }
                    setContactToAdd("");
                  }}
                  className="flex-shrink-0 w-[38px] h-[38px] rounded-full bg-[#158FFF] flex items-center justify-center hover:opacity-90 transition-opacity"
                  title="Add contact"
                >
                  <PlusIcon className="w-4 h-4 text-white" />
                </button>
              </div>
              {taggedContacts.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {taggedContacts.map((tc) => (
                    <span
                      key={tc.value}
                      className="inline-flex items-center gap-1 pl-2.5 pr-1.5 h-6 rounded-full bg-blue-50 text-blue-700 text-[11px] font-medium"
                    >
                      {tc.label}
                      <button
                        type="button"
                        onClick={() => setTaggedContacts(taggedContacts.filter((c) => c.value !== tc.value))}
                        className="hover:bg-blue-100 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Link Deal
              </label>
              <div className="flex items-center gap-3">
                <EntityPickerDropdown
                  options={deals}
                  value={dealToAdd}
                  onChange={setDealToAdd}
                  displayKey="title"
                  placeholder="Choose Deal"
                  onOpenChange={handleDropdownOpenChange}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!dealToAdd) return;
                    const deal = deals.find((d) => d._id === dealToAdd);
                    if (!deal) return;
                    if (!taggedDeals.some((td) => td.value === deal._id)) {
                      setTaggedDeals([...taggedDeals, { label: deal.title || deal.name, value: deal._id }]);
                    }
                    setDealToAdd("");
                  }}
                  className="flex-shrink-0 w-[38px] h-[38px] rounded-full bg-[#158FFF] flex items-center justify-center hover:opacity-90 transition-opacity"
                  title="Add deal"
                >
                  <PlusIcon className="w-4 h-4 text-white" />
                </button>
              </div>
              {taggedDeals.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {taggedDeals.map((td) => (
                    <span
                      key={td.value}
                      className="inline-flex items-center gap-1 pl-2.5 pr-1.5 h-6 rounded-full bg-blue-50 text-blue-700 text-[11px] font-medium"
                    >
                      {td.label}
                      <button
                        type="button"
                        onClick={() => setTaggedDeals(taggedDeals.filter((d) => d.value !== td.value))}
                        className="hover:bg-blue-100 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                Link Invoice
              </label>
              <div className="flex items-center gap-3">
                <EntityPickerDropdown
                  options={invoices}
                  value={invoiceToAdd}
                  onChange={setInvoiceToAdd}
                  displayKey="invoiceNumber"
                  placeholder="Choose Invoice"
                  onOpenChange={handleDropdownOpenChange}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!invoiceToAdd) return;
                    const invoice = invoices.find((i) => i._id === invoiceToAdd);
                    if (!invoice) return;
                    if (!taggedInvoices.some((ti) => ti.value === invoice._id)) {
                      setTaggedInvoices([...taggedInvoices, { label: invoice.invoiceNumber, value: invoice._id }]);
                    }
                    setInvoiceToAdd("");
                  }}
                  className="flex-shrink-0 w-[38px] h-[38px] rounded-full bg-[#158FFF] flex items-center justify-center hover:opacity-90 transition-opacity"
                  title="Add invoice"
                >
                  <PlusIcon className="w-4 h-4 text-white" />
                </button>
              </div>
              {taggedInvoices.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {taggedInvoices.map((ti) => (
                    <span
                      key={ti.value}
                      className="inline-flex items-center gap-1 pl-2.5 pr-1.5 h-6 rounded-full bg-blue-50 text-blue-700 text-[11px] font-medium"
                    >
                      {ti.label}
                      <button
                        type="button"
                        onClick={() => setTaggedInvoices(taggedInvoices.filter((i) => i.value !== ti.value))}
                        className="hover:bg-blue-100 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sticky footer — matches the CompanyForm/TaskForm footer spec */}
          <div className="flex-shrink-0 py-2.5 px-4 border-t border-gray-100 bg-white flex items-center justify-end gap-3">
            {isEditing && (
              <button
                type="button"
                onClick={onDelete}
                className="mr-auto w-8 h-8 flex items-center justify-center text-[#DF120B] hover:bg-red-50 rounded-full transition-colors"
                title="Delete Note"
              >
                <DeleteIcon className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading || !noteTitle.trim() || !noteContent.trim() || noteContent === '<p><br></p>'}
              className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Saving...' : 'Save Note'}
            </button>
          </div>
        </form>
      </div>

      {linkModalOpen && (
        <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setLinkModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Insert Link</h4>
            <div className="flex items-center w-full px-3 py-2 border border-gray-300 rounded-lg focus-within:border-blue-400">
              <span className="text-sm font-bold text-gray-800 flex-shrink-0">https://</span>
              <input
                type="text"
                autoFocus
                value={linkModalUrl}
                onChange={(e) => setLinkModalUrl(e.target.value.replace(/^https?:\/\//i, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); confirmInsertLink(); }
                  if (e.key === "Escape") setLinkModalOpen(false);
                }}
                placeholder="example.com"
                className="flex-1 min-w-0 text-sm text-gray-800 focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setLinkModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmInsertLink}
                disabled={!linkModalUrl.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Insert
              </button>
            </div>
          </div>
        </div>
      )}

      <NoteStyles />
    </>
  );
};


// Main NoteSection component
const NoteSection = ({ companyId: propCompanyId, dealId, isQuickView }) => {
  const { id: paramCompanyId } = useParams();
  // On a deal page this is passed explicitly; the useParams fallback is the
  // company route's :id, which must NOT be used when we're scoped to a deal.
  const companyId = propCompanyId || (dealId ? undefined : paramCompanyId);
  const [notes, setNotes] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [taggedContacts, setTaggedContacts] = useState([]);
  const [noteType, setNoteType] = useState("General Note");
  const [visibility, setVisibility] = useState("Team");
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [viewingNote, setViewingNote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [showAllNotes, setShowAllNotes] = useState(false);

  const { noteTypes } = useSystemSettings();

  const fetchNotes = useCallback(async () => {
    // Scope to the deal when given one, otherwise to the company.
    if (!dealId && !companyId) {
      setNotes([]);
      return;
    }
    try {
      const url = dealId ? `/notes/deal/${dealId}` : `/notes/company/${companyId}`;
      const res = await API.get(url);
      const sortedNotes = res.data.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      );
      setNotes(sortedNotes);
    } catch (err) {
      toast.error("Failed to load notes");
    }
  }, [companyId, dealId]);

  const fetchContacts = useCallback(async () => {
    try {
      const res = await API.get("/contacts");
      const companyContacts = res.data.filter(
        (c) => c.company?._id === companyId,
      );
      setContacts(companyContacts);
    } catch (err) {
      toast.error("Failed to load contacts");
    }
  }, [companyId]);

  const fetchDeals = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await API.get("/deals");
      setDeals(res.data.filter((d) => d.company?._id === companyId));
    } catch (err) {
      toast.error("Failed to load deals");
    }
  }, [companyId]);

  const fetchInvoices = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await API.get("/invoices");
      setInvoices(res.data.filter((inv) => inv.deal?.company === companyId || inv.deal?.company?._id === companyId));
    } catch (err) {
      toast.error("Failed to load invoices");
    }
  }, [companyId]);

  useEffect(() => {
    fetchNotes();
    fetchContacts();
    fetchDeals();
    fetchInvoices();
  }, [fetchNotes, fetchContacts, fetchDeals, fetchInvoices]);

  const handleAddOrUpdateNote = async () => {
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
          taggedContacts: taggedContacts.map((c) => c.value),
          noteType,
          visibility,
        });
        toast.success("Note updated");
      } else {
        await API.post("/notes", {
          title: noteTitle,
          note: noteContent,
          company: companyId,
          // Scope the note to the deal when this section is mounted on one.
          ...(dealId ? { deal: dealId } : {}),
          taggedContacts: taggedContacts.map((c) => c.value),
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
      note.taggedContacts.map((c) => ({
        label: c.name,
        value: c._id,
      })),
    );
    setNoteType(note.noteType || "General Note");
    setVisibility(note.visibility || "Team");
    setIsEditorOpen(true);
  };

  const handleView = (note) => {
    setViewingNote(note);
    setIsViewerOpen(true);
  };

  const handleDelete = async (noteId) => {
    if (window.confirm("Delete this note?")) {
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
    }
  };

  const resetForm = () => {
    setEditingNoteId(null);
    setNoteTitle("");
    setNoteContent("");
    setTaggedContacts([]);
    setNoteType("General Note");
    setVisibility("Team");
    setIsEditorOpen(false);
  };

  const closeViewer = () => {
    setViewingNote(null);
    setIsViewerOpen(false);
  };

  const filteredNotes = useMemo(() => {
    if (!searchTerm) return notes;
    return notes.filter((note) => {
      const content = note.note.replace(/<[^>]*>/g, "").toLowerCase();
      const taggedNames = note.taggedContacts
        .map((c) => c.name.toLowerCase())
        .join(" ");
      return (
        content.includes(searchTerm.toLowerCase()) ||
        taggedNames.includes(searchTerm.toLowerCase())
      );
    });
  }, [notes, searchTerm]);

  return (
    <div className="h-full">
      <AppToaster />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <StickyNote className="w-4 h-4" />
          <span>{filteredNotes.length} notes</span>
        </div>
        <button
          onClick={() => setIsEditorOpen(true)}
          className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-800 text-sm transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          New Note
        </button>
      </div>

      <div className="relative mb-4">
        <SearchIcon className="absolute left-3 -translate-y-1/2 top-1/2 w-4 h-4 text-[#525866]" />
        <input
          type="text"
          placeholder="Search notes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-11 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-gray-400"
        />
      </div>

      {filteredNotes.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <StickyNote className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-sm text-gray-600 mb-4">
            {searchTerm ? "No notes found" : "No notes yet"}
          </p>
          {!searchTerm && (
            <button
              onClick={() => setIsEditorOpen(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-800 text-sm transition-colors"
            >
              Create Note
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {(isQuickView && !showAllNotes ? filteredNotes.slice(0, 5) : filteredNotes).map((note) => (
            <NoteCard
              key={note._id}
              note={note}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onView={handleView}
            />
          ))}
          {isQuickView && !showAllNotes && filteredNotes.length > 5 && (
            <div className="pt-4 flex justify-center">
              <button
                onClick={() => setShowAllNotes(true)}
                className="px-6 py-2.5 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition-colors text-sm w-full md:w-auto shadow-sm"
              >
                View All Notes ({filteredNotes.length})
              </button>
            </div>
          )}
          {isQuickView && showAllNotes && (
            <div className="pt-4 flex justify-center">
              <button
                onClick={() => setShowAllNotes(false)}
                className="px-6 py-2.5 text-blue-600 font-semibold hover:bg-blue-50 transition-colors text-sm rounded-lg"
              >
                Show Less
              </button>
            </div>
          )}
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
        deals={deals}
        invoices={invoices}
        noteType={noteType}
        setNoteType={setNoteType}
        visibility={visibility}
        setVisibility={setVisibility}
        onSave={handleAddOrUpdateNote}
        onDelete={() => handleDelete(editingNoteId)}
        loading={loading}
        isEditing={!!editingNoteId}
        noteTypes={noteTypes}
      />

      <NoteViewer
        isOpen={isViewerOpen}
        onClose={closeViewer}
        note={viewingNote}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <NoteStyles />
    </div>
  );
};

export default NoteSection;
