import DeleteIcon from "../common/DeleteIcon";
import PlusIcon from "../common/PlusIcon";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import ReactQuill from "react-quill-new";
import "react-quill/dist/quill.snow.css";
import API from "../../services/api";
import { useParams } from "react-router-dom";
import toast from 'react-hot-toast';
import { 
  StickyNote,
  Clock,
  User,
  Save,
  X
} from "lucide-react";
import AppToaster from "../AppToaster";


import SearchIcon from "../common/SearchIcon";
import EyeIcon from "../common/EyeIcon";
import EditIcon from "../common/EditIcon";
// Custom Quill modules and formats configuration
const quillModules = {
  toolbar: [
    [{ 'header': [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    ['link'],
    ['clean']
  ],
  clipboard: {
    matchVisual: false,
  }
};

// ✅ Fixed: Removed 'bullet' from formats
const quillFormats = [
  'header', 'bold', 'italic', 'underline', 'strike',
  'list', 'link'
];


// Note Viewer Modal
const NoteViewer = ({ isOpen, onClose, noteContent, contactName, updatedAt }) => {
  if (!isOpen) return null;

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString([], { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[10000] p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-lg border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">View Note</h2>
            <p className="text-xs text-gray-500 mt-1">
              {contactName} · {formatDate(updatedAt)}
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content - Added ql-editor class */}
        <div className="p-4 overflow-y-auto max-h-[calc(85vh-120px)]">
          <div className="ql-editor prose prose-sm max-w-none">
            <div dangerouslySetInnerHTML={{ __html: noteContent }} />
          </div>
        </div>
      </div>
    </div>
  );
};


// Note Card Component
const NoteCard = ({ note, onEdit, onDelete, onView, contactName }) => {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.abs(now - date) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 168) {
      return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
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
    <div className="bg-white rounded-lg border border-gray-200 p-3 hover:border-gray-300 transition-all group">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Clock className="w-3 h-3" />
          <span>{formatDate(note.updatedAt)}</span>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onView(note)}
            className="p-1 text-gray-600 hover:text-gray-900 transition-colors"
            title="View"
          >
            <EyeIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => onEdit(note)}
            className="p-1 text-gray-600 hover:text-gray-900 transition-colors"
            title="Edit"
          >
            <EditIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(note._id)}
            className="p-1 text-gray-600 hover:text-gray-900 transition-colors"
            title="Delete"
          >
            <DeleteIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div className="flex flex-col items-start w-full gap-2 mb-2">
        <p className={`text-gray-700 text-sm leading-relaxed w-full ${isExpanded ? "" : "line-clamp-3"}`}>
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

      <div className="flex items-center gap-1 text-xs text-gray-500">
        <User className="w-3 h-3" />
        <span>{contactName}</span>
      </div>
    </div>
  );
};


// Note Editor Modal
export const NoteEditor = ({ 
  isOpen, 
  onClose, 
  noteContent, 
  setNoteContent, 
  onSave, 
  loading, 
  isEditing,
  contactName 
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[10000] p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-lg border border-gray-200">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {isEditing ? 'Edit Note' : 'New Note'}
            </h2>
            <p className="text-xs text-gray-600 mt-1">
              {isEditing ? 'Update your note' : `Note for ${contactName}`}
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(85vh-140px)]">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Note
              </label>
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <ReactQuill
                  value={noteContent}
                  onChange={setNoteContent}
                  modules={quillModules}
                  formats={quillFormats}
                  theme="snow"
                  placeholder="Write your note..."
                  style={{ minHeight: '180px' }}
                />
              </div>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <User className="w-4 h-4" />
                <span>Tagged: {contactName}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={loading || !noteContent.trim()}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {isEditing ? 'Update' : 'Save'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};


// Main NoteSection Component
const NoteSection = ({ contactId: propContactId, isQuickView }) => {
  const { id: paramContactId } = useParams();
  const contactId = propContactId || paramContactId;
  const [notes, setNotes] = useState([]);
  const [contact, setContact] = useState(null);
  const [noteContent, setNoteContent] = useState("");
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [viewingNote, setViewingNote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [showAllNotes, setShowAllNotes] = useState(false);

  const fetchNotes = useCallback(async () => {
    // No contact to scope to (e.g. this section is mounted on a deal that has
    // no contact yet) — skip the request instead of hitting /notes/contact/
    // undefined and spamming an error toast.
    if (!contactId) {
      setNotes([]);
      return;
    }
    try {
      const res = await API.get(`/notes/contact/${contactId}`);
      const sortedNotes = res.data.sort(
        (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
      );
      setNotes(sortedNotes);
    } catch (err) {
      toast.error("Failed to load notes");
    }
  }, [contactId]);

  const fetchContact = useCallback(async () => {
    if (!contactId) {
      setContact(null);
      return;
    }
    try {
      const res = await API.get(`/contacts/${contactId}`);
      setContact(res.data);
    } catch (err) {
      toast.error("Failed to load contact");
    }
  }, [contactId]);

  useEffect(() => {
    fetchNotes();
    fetchContact();
  }, [fetchNotes, fetchContact]);

  const handleAddOrUpdateNote = async () => {
    if (!noteContent.trim() || noteContent === "<p><br></p>") {
      toast.error("Please add some note content before saving.");
      return;
    }

    if (!contact?.company?._id) {
      toast.error("This contact isn't linked to a company yet — add one first.");
      return;
    }

    try {
      setLoading(true);
      if (editingNoteId) {
        await API.put(`/notes/${editingNoteId}`, {
          note: noteContent,
          taggedContacts: [contactId],
        });
        toast.success("Note updated");
      } else {
        await API.post("/notes", {
          note: noteContent,
          company: contact.company._id,
          taggedContacts: [contactId],
        });
        toast.success("Note added");
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
    setNoteContent(note.note);
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
    setNoteContent("");
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
      return content.includes(searchTerm.toLowerCase());
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
              contactName={contact?.name || "Contact"}
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
        noteContent={noteContent}
        setNoteContent={setNoteContent}
        onSave={handleAddOrUpdateNote}
        loading={loading}
        isEditing={!!editingNoteId}
        contactName={contact?.name || "this contact"}
      />

      <NoteViewer
        isOpen={isViewerOpen}
        onClose={closeViewer}
        noteContent={viewingNote?.note || ""}
        contactName={contact?.name || "Contact"}
        updatedAt={viewingNote?.updatedAt}
      />

      <style jsx global>{`
        /* Quill Editor Styles */
        .ql-editor ol,
        .prose ol,
        .ql-editor[contenteditable="false"] ol {
          list-style-type: decimal;
          padding-left: 1.5em;
          margin: 0.5em 0;
        }

        .ql-editor ul,
        .prose ul,
        .ql-editor[contenteditable="false"] ul {
          list-style-type: disc;
          padding-left: 1.5em;
          margin: 0.5em 0;
        }

        .ql-editor li,
        .prose li {
          padding-left: 0.3em;
          margin-bottom: 0.25em;
        }

        /* Nested lists */
        .ql-editor ol ol,
        .ql-editor ul ul,
        .prose ol ol,
        .prose ul ul {
          margin-top: 0.25em;
          margin-bottom: 0.25em;
        }

        .ql-toolbar {
          border: none;
          border-bottom: 1px solid #e5e7eb;
          padding: 8px 12px;
          background: #f9fafb;
        }

        .ql-container {
          border: none;
          font-family: inherit;
        }

        .ql-editor {
          padding: 12px;
          min-height: 180px;
          font-size: 14px;
          line-height: 1.6;
        }

        /* Viewer specific styles */
        .ql-editor[contenteditable="false"] {
          padding: 0;
          min-height: auto;
        }

        .prose {
          color: #374151;
        }

        .prose p {
          margin-bottom: 0.75em;
        }

        .prose strong {
          font-weight: 600;
        }

        .prose a {
          color: #2563eb;
          text-decoration: underline;
        }

        /* Headers in content */
        .prose h1,
        .ql-editor h1 {
          font-size: 1.5em;
          font-weight: 600;
          margin-top: 0.5em;
          margin-bottom: 0.5em;
          color: #111827;
        }

        .prose h2,
        .ql-editor h2 {
          font-size: 1.25em;
          font-weight: 600;
          margin-top: 0.5em;
          margin-bottom: 0.5em;
          color: #111827;
        }

        .prose h3,
        .ql-editor h3 {
          font-size: 1.1em;
          font-weight: 600;
          margin-top: 0.5em;
          margin-bottom: 0.5em;
          color: #111827;
        }
      `}</style>
    </div>
  );
};

export default NoteSection;
