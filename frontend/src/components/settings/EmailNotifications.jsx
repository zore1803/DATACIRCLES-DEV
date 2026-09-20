import CalendarIcon from "../common/CalendarIcon";
import DeleteIcon from "../common/DeleteIcon";
import PdfIcon from "../common/PdfIcon";
import Checkbox from "../common/Checkbox";
import React, { useState, useEffect } from "react";
import {
  Mail,
  Bell,
  CheckCircle,
  Briefcase,
  PlusCircle,
  X,
  Save,
  Loader2,
  Zap,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import API, { configureAxios } from "../../services/api";
import { useAuth0 } from "@auth0/auth0-react";
import toast from "react-hot-toast";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import AppToaster from "../AppToaster";
import EyeIcon from "../common/EyeIcon";
import EditIcon from "../common/EditIcon";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

// ✅ Fixed Quill configuration
const quillModules = {
  toolbar: [
    [{ header: [1, 2, false] }],
    ["bold", "italic", "underline"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["link"],
    ["clean"],
  ],
};

const quillFormats = [
  "header",
  "bold",
  "italic",
  "underline",
  "list",
  "link",
];

// ✅ NEW: Email Template Preview Modal
const EmailTemplatePreview = ({ isOpen, onClose, template }) => {
  if (!isOpen || !template) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[10002] transition-opacity"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[10003] overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div
            className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl transform transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="border-b-2 border-gray-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 p-2 rounded-lg">
                    <EyeIcon className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">
                      Template Preview
                    </h2>
                    <p className="text-sm text-gray-500">{template.name}</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            {/* Email Preview */}
            <div className="px-6 py-6">
              {/* Email Subject */}
              <div className="mb-6 bg-gray-50 rounded-lg p-4 border-2 border-gray-200">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                  Subject
                </label>
                <p className="text-base font-semibold text-gray-900">
                  {template.subject}
                </p>
              </div>

              {/* Template Info */}
              <div className="mb-4 flex items-center gap-3">
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-purple-100 text-purple-700 font-medium text-sm">
                  {template.type === "task" && "📋 Task"}
                  {template.type === "meeting" && "📅 Meeting"}
                  {template.type === "deal" && "💼 Deal"}
                </span>
                {template.type === "deal" &&
                  template.dealTransition?.from &&
                  template.dealTransition?.to && (
                    <span className="text-sm text-gray-600">
                      {template.dealTransition.from} → {template.dealTransition.to}
                    </span>
                  )}
              </div>

              {/* Email Body Preview */}
              <div className="bg-white border-2 border-gray-200 rounded-lg">
                <div className="border-b-2 border-gray-200 px-4 py-3 bg-gray-50">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Email Body
                  </label>
                </div>
                <div className="p-6">
                  <div
                    className="ql-editor prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: template.body }}
                  />
                </div>
              </div>

              {/* Variables Info */}
              <div className="mt-4 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
                <p className="text-xs font-semibold text-blue-900 mb-2">
                  📌 Available Variables:
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-blue-700">
                  <div><code className="bg-blue-100 px-1.5 py-0.5 rounded">&#123;&#123;userName&#125;&#125;</code> - User name</div>
                  <div><code className="bg-blue-100 px-1.5 py-0.5 rounded">&#123;&#123;dealTitle&#125;&#125;</code> - Deal title</div>
                  <div><code className="bg-blue-100 px-1.5 py-0.5 rounded">&#123;&#123;oldStatus&#125;&#125;</code> - Previous stage</div>
                  <div><code className="bg-blue-100 px-1.5 py-0.5 rounded">&#123;&#123;newStatus&#125;&#125;</code> - New stage</div>
                  <div><code className="bg-blue-100 px-1.5 py-0.5 rounded">&#123;&#123;amount&#125;&#125;</code> - Deal amount</div>
                  <div><code className="bg-blue-100 px-1.5 py-0.5 rounded">&#123;&#123;companyName&#125;&#125;</code> - Company</div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t-2 border-gray-200 px-6 py-4 bg-gray-50 rounded-b-xl">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .ql-editor ol,
        .ql-editor[contenteditable="false"] ol {
          list-style-type: decimal;
          padding-left: 1.5em;
          margin: 0.5em 0;
        }
        
        .ql-editor ul,
        .ql-editor[contenteditable="false"] ul {
          list-style-type: disc;
          padding-left: 1.5em;
          margin: 0.5em 0;
        }
        
        .ql-editor li {
          padding-left: 0.3em;
          margin-bottom: 0.25em;
        }

        .ql-editor[contenteditable="false"] {
          padding: 0;
          min-height: auto;
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
      `}</style>
    </>
  );
};

// EmailTemplateForm component
const EmailTemplateForm = ({
  isOpen,
  onClose,
  statuses,
  template,
  onSave,
}) => {
  const [templateForm, setTemplateForm] = useState({
    name: "",
    subject: "",
    body: "",
    type: "deal",
    dealTransition: { from: "", to: "" },
  });
  const [isSliding, setIsSliding] = useState(false);
  const [shouldRender, setShouldRender] = useState(true);

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (template) {
      setTemplateForm({
        name: template.name || "",
        subject: template.subject || "",
        body: template.body || "",
        type: "deal",
        dealTransition: template.dealTransition || { from: "", to: "" },
      });
    } else {
      setTemplateForm({
        name: "",
        subject: "",
        body: "",
        type: "deal",
        dealTransition: { from: "", to: "" },
      });
    }
  }, [template]);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => setIsSliding(true), 10);
    } else {
      setIsSliding(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [isOpen]);

  const handleTemplateChange = (e) => {
    const { name, value } = e.target;
    setTemplateForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleBodyChange = (value) => {
    setTemplateForm((prev) => ({ ...prev, body: value }));
  };

  const handleSaveTemplate = async () => {
    if (
      !templateForm.name ||
      !templateForm.subject ||
      !templateForm.body ||
      templateForm.body === "<p><br></p>"
    ) {
      toast.error("Name, subject, and body cannot be empty");
      return;
    }
    try {
      if (template) {
        await API.put(`/email-templates/${template._id}`, templateForm);
        toast.success("Template updated successfully");
      } else {
        await API.post("/email-templates", templateForm);
        toast.success("Template created successfully");
      }
      setTemplateForm({
        name: "",
        subject: "",
        body: "",
        type: "deal",
        dealTransition: { from: "", to: "" },
      });
      onSave();
      onClose();
    } catch (err) {
      onClose();
      console.error(err);
      toast.error(err?.response?.data?.error);
    }
  };

  if (!shouldRender) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300 ease-in-out"
        style={{ opacity: isSliding ? 1 : 0 }}
        onClick={onClose}
      />
      <div
        className={`fixed dc-panel-card dc-panel-w z-[10001] bg-white shadow-2xl overflow-y-auto transform transition-transform duration-300 ease-in-out ${isSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}`}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b-2 border-gray-200 px-6 py-5 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2.5 rounded-xl">
                <PdfIcon className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  {template ? "Edit Template" : "Create New Template"}
                </h3>
                <p className="text-sm text-gray-600">
                  {template
                    ? "Update your email template"
                    : "Design your deal notification"}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form Content */}
        <div className="p-6 space-y-6">
          {/* Template Name */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              <PdfIcon className="w-4 h-4" />
              Template Name
            </label>
            <input
              name="name"
              value={templateForm.name}
              onChange={handleTemplateChange}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm outline-none shadow-sm transition-all"
              placeholder="e.g., Deal Won Notification"
            />
          </div>

          {/* Email Subject */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              <Mail className="w-4 h-4" />
              Email Subject
            </label>
            <input
              name="subject"
              value={templateForm.subject}
              onChange={handleTemplateChange}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm outline-none shadow-sm transition-all"
              placeholder="e.g., Deal Won"
            />
          </div>

          {/* Email Body */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              <EditIcon className="w-4 h-4" />
              Email Body
            </label>
            <div className="border-2 border-gray-300 rounded-xl overflow-hidden shadow-sm">
              <ReactQuill
                value={templateForm.body}
                onChange={handleBodyChange}
                modules={quillModules}
                formats={quillFormats}
                className="bg-white"
                theme="snow"
                placeholder="Write your email template here... You can use HTML formatting."
                style={{ minHeight: "250px" }}
              />
            </div>
            <p className="text-xs text-gray-700 mt-2 font-semibold">
              Available Variables:
            </p>
            <ul className="text-xs text-gray-600 mb-2 pl-4 list-disc">
              <li><code>&#123;&#123;userName&#125;&#125;</code>: Assignee/User name</li>
              <li><code>&#123;&#123;dealTitle&#125;&#125;</code>: Deal title</li>
              <li><code>&#123;&#123;oldStatus&#125;&#125;</code>: Previous deal stage</li>
              <li><code>&#123;&#123;newStatus&#125;&#125;</code>: New deal stage</li>
              <li><code>&#123;&#123;amount&#125;&#125;</code>: Deal amount</li>
              <li><code>&#123;&#123;companyName&#125;&#125;</code>: Associated company name</li>
              <li><code>&#123;&#123;contactName&#125;&#125;</code>: Deal contact name</li>
              <li><code>&#123;&#123;updatedAt&#125;&#125;</code>: Deal last updated date</li>
            </ul>
            <p className="text-xs text-gray-500">
              Tip: Insert these variables for dynamic deal information in your template.
            </p>
          </div>

          {/* Notification Type (locked to deal) */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              <Zap className="w-4 h-4" />
              Notification Type
            </label>
            <select
              name="type"
              value={templateForm.type}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm outline-none shadow-sm transition-all bg-white"
              disabled
            >
              <option value="deal">💼 Deal</option>
            </select>
          </div>

          {/* Deal Transitions */}
          <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Briefcase className="w-5 h-5 text-purple-600" />
              <h4 className="font-semibold text-purple-900">
                Deal Stage Transition
              </h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  From Stage
                </label>
                <select
                  value={templateForm?.dealTransition?.from}
                  onChange={(e) =>
                    setTemplateForm((prev) => ({
                      ...prev,
                      dealTransition: {
                        ...prev.dealTransition,
                        from: e.target.value,
                      },
                    }))
                  }
                  className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm outline-none shadow-sm bg-white"
                >
                  <option value="">Select stage...</option>
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  To Stage
                </label>
                <select
                  value={templateForm.dealTransition?.to}
                  onChange={(e) =>
                    setTemplateForm((prev) => ({
                      ...prev,
                      dealTransition: {
                        ...prev.dealTransition,
                        to: e.target.value,
                      },
                    }))
                  }
                  className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm outline-none shadow-sm bg-white"
                >
                  <option value="">Select stage...</option>
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-gray-50 border-t-2 border-gray-200 px-6 py-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveTemplate}
            className="flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-xl transition-all shadow-lg"
          >
            <Save className="w-4 h-4" />
            {template ? "Update Template" : "Create Template"}
          </button>
        </div>

        <style jsx global>{`
          .ql-editor ol {
            list-style-type: decimal;
            padding-left: 1.5em;
            margin: 0.5em 0;
          }
          
          .ql-editor ul {
            list-style-type: disc;
            padding-left: 1.5em;
            margin: 0.5em 0;
          }
          
          .ql-editor li {
            padding-left: 0.3em;
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
            min-height: 250px;
            font-size: 14px;
            line-height: 1.6;
          }
        `}</style>
      </div>
    </>
  );
};

const EmailNotifications = () => {
  const { getAccessTokenSilently } = useAuth0();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statuses, setStatuses] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [previewTemplate, setPreviewTemplate] = useState(null); // ✅ NEW
  const [showPreview, setShowPreview] = useState(false); // ✅ NEW

  const [emailSettings, setEmailSettings] = useState({
    tasks: false,
    meetings: false,
    deals: false,
    dealTransitions: [],
  });

  useEffect(() => {
    configureAxios(getAccessTokenSilently);

    const fetchData = async () => {
      try {
        const [settingsRes, kanbanRes, templatesRes] = await Promise.all([
          API.get("/notification"),
          API.get("/kanban"),
          API.get("/email-templates"),
        ]);

        if (settingsRes.data) {
          setEmailSettings({
            tasks: settingsRes.data.tasks ?? false,
            meetings: settingsRes.data.meetings ?? false,
            deals: settingsRes.data.deals ?? false,
            dealTransitions: settingsRes.data.dealTransitions ?? [],
          });
        }
        setStatuses(kanbanRes.data?.statuses || []);
        setTemplates(templatesRes.data || []);
      } catch (error) {
        console.error("Error fetching data:", error);
        toast.error("Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [getAccessTokenSilently]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await API.put("/notification", emailSettings);
      toast.success("Settings saved successfully!");
    } catch (error) {
      console.error("Error saving settings:", error);
      if (error.response?.status === 402) {
        toast.error(error.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(error.response?.data?.error || "Failed to save settings");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (type) => {
    setEmailSettings((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  };

  const handleTransitionToggle = (fromStatus, toStatus) => {
    setEmailSettings((prev) => {
      const transitions = [...prev.dealTransitions];
      const index = transitions.findIndex(
        (t) => t.from === fromStatus && t?.to === toStatus
      );
      if (index !== -1) transitions.splice(index, 1);
      else transitions.push({ from: fromStatus, to: toStatus });
      return { ...prev, dealTransitions: transitions };
    });
  };

  const isTransitionEnabled = (fromStatus, toStatus) => {
    return emailSettings.dealTransitions.some(
      (t) => t.from === fromStatus && t?.to === toStatus
    );
  };

  const handleOpenModal = (template = null) => {
    setEditingTemplate(template);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingTemplate(null);
  };

  // ✅ NEW: Preview handlers
  const handleOpenPreview = (template) => {
    setPreviewTemplate(template);
    setShowPreview(true);
  };

  const handleClosePreview = () => {
    setShowPreview(false);
    setPreviewTemplate(null);
  };

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm("Are you sure you want to delete this template?"))
      return;
    try {
      await API.delete(`/email-templates/${id}`);
      setTemplates((prev) => prev.filter((t) => t._id !== id));
      toast.success("Template deleted successfully");
    } catch (err) {
      console.error(err);
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to delete template");
      }
    }
  };

  const handleSaveTemplateSuccess = async () => {
    const res = await API.get("/email-templates");
    setTemplates(res.data);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
        <p className="text-gray-600 font-medium">Loading settings...</p>
      </div>
    );
  }

  const notificationTypes = [
    {
      id: "tasks",
      label: "Task Notifications",
      description:
        "Receive email notifications when tasks are assigned to you or updated",
      icon: <CheckCircle className="w-5 h-5" />,
      color: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
    },
    {
      id: "meetings",
      label: "Meeting Notifications",
      description:
        "Get notified about meeting invitations, updates, and reminders",
      icon: <CalendarIcon className="w-5 h-5" />,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
    },
  ];

  const activeCount =
    Object.values(emailSettings).filter(Boolean).length -
    (emailSettings.deals ? 1 : 0);

  return (
    <div className="">
      <AppToaster />

      {/* Notification Settings */}
      <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-lg">
        <div className="p-6 border-b-2 border-gray-100">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-xl font-bold text-gray-900">
              Notification Preferences
            </h2>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            Choose which activities should trigger automatic email notifications
            to your team
          </p>
        </div>

        <div className="divide-y divide-gray-200">
          {notificationTypes.map((type) => (
            <div key={type.id} className="p-6 hover:bg-gray-50 transition-colors">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4 flex-1">
                  <div
                    className={`p-3 rounded-xl ${type.bgColor} border-2 ${type.borderColor} shadow-sm`}
                  >
                    <div className={type.color}>{type.icon}</div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-base font-bold text-gray-900">
                        {type.label}
                      </h3>
                      {emailSettings[type.id] && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {type.description}
                    </p>
                  </div>
                </div>

                <div className="flex-shrink-0 md:ml-auto">
                  <button
                    onClick={() => handleToggle(type.id)}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-inner ${
                      emailSettings[type.id] ? "bg-blue-600" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                        emailSettings[type.id]
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {emailSettings[type.id] && (
                <div className="mt-4 ml-16 p-4 bg-green-50 border-2 border-green-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="text-sm font-bold text-green-900">
                        Email notifications enabled
                      </span>
                      <p className="text-xs text-green-700 mt-1 leading-relaxed">
                        You'll receive automatic emails for all{" "}
                        {type.label.toLowerCase()} activities. Check your email
                        templates to customize messages.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Deals Section */}
          <div className="p-6 hover:bg-gray-50 transition-colors">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div className="flex items-start gap-4 flex-1">
                <div className="p-3 rounded-xl bg-purple-50 border-2 border-purple-200 shadow-sm">
                  <Briefcase className="w-5 h-5 text-purple-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-base font-bold text-gray-900">
                      Deal Notifications
                    </h3>
                    {emailSettings.deals && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Get notified when deals move between pipeline stages
                  </p>
                </div>
              </div>

              <div className="flex-shrink-0 md:ml-auto">
                <button
                  onClick={() => handleToggle("deals")}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-inner ${
                    emailSettings.deals ? "bg-blue-600" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                      emailSettings.deals ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            {emailSettings.deals && (
              <div className="mt-4 ml-16">
                <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <ArrowRight className="w-5 h-5 text-purple-600" />
                    <h4 className="font-bold text-purple-900">
                      Stage Transitions
                    </h4>
                  </div>
                  <p className="text-xs text-purple-700 mb-4 leading-relaxed">
                    Select specific status changes to receive email
                    notifications for:
                  </p>

                  <div className="bg-white rounded-xl border border-purple-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead className="bg-purple-100">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold text-purple-900 uppercase tracking-wider">
                              From → To
                            </th>
                            {statuses.map((toStatus) => (
                              <th
                                key={toStatus}
                                className="px-4 py-3 text-center text-xs font-bold text-purple-900 uppercase tracking-wider"
                              >
                                {toStatus}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-purple-100">
                          {statuses.map((fromStatus) => (
                            <tr key={fromStatus} className="hover:bg-purple-50">
                              <td className="px-4 py-3 text-sm font-semibold text-gray-900 whitespace-nowrap">
                                {fromStatus}
                              </td>
                              {statuses.map((toStatus) => (
                                <td
                                  key={toStatus}
                                  className="px-4 py-3 text-center"
                                >
                                  {fromStatus !== toStatus && (
                                    <Checkbox checked={isTransitionEnabled(
                                        fromStatus,
                                        toStatus
                                      )} onChange={() =>
                                        handleTransitionToggle(
                                          fromStatus,
                                          toStatus
                                        )
                                      } />
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Save Footer */}
        <div className="px-6 py-5 bg-gradient-to-r from-gray-50 to-gray-100 border-t-2 border-gray-200 rounded-b-2xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-gray-500" />
              <span className="text-sm text-gray-600">
                {activeCount} of 3 notification types enabled
              </span>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              style={saving ? undefined : { backgroundColor: "#0085FF" }}
              className={`flex items-center gap-2 px-6 py-3 text-white font-semibold rounded-xl transition-all shadow-lg ${
                saving
                  ? "bg-gray-400 cursor-not-allowed"
                  : "hover:opacity-90"
              }`}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Settings
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Email Templates Section */}
      <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-lg mt-8">
        <div className="p-6 border-b-2 border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 p-2 rounded-lg">
              <PdfIcon className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Email Templates
              </h2>
              <p className="text-sm text-gray-600">
                Customize your notification messages
              </p>
            </div>
          </div>
          <button
            onClick={() => handleOpenModal()}
            style={{ backgroundColor: "#0085FF" }}
            className="flex items-center gap-2 px-5 py-3 hover:opacity-90 text-white font-semibold rounded-xl transition-all shadow-lg"
          >
            <PlusCircle className="w-5 h-5" />
            New Template
          </button>
        </div>

        <div className="divide-y divide-gray-200">
          {templates.length === 0 ? (
            <div className="p-12 text-center">
              <div className="bg-gray-100 p-4 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <PdfIcon className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium mb-2">
                No templates found
              </p>
              <p className="text-sm text-gray-400">
                Click "New Template" to create your first email template
              </p>
            </div>
          ) : (
            templates.map((template) => (
              <div
                key={template._id}
                className="p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="bg-blue-100 p-2.5 rounded-lg">
                      <Mail className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-900 mb-1">
                        {template.name}
                      </h3>
                      <div className="flex items-center gap-3 text-sm text-gray-600 mb-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
                          {template.type === "task" && "📋 Task"}
                          {template.type === "meeting" && "📅 Meeting"}
                          {template.type === "deal" && "💼 Deal"}
                        </span>
                        {template.type === "deal" &&
                          template.dealTransition?.from &&
                          template.dealTransition?.to && (
                            <span className="text-xs">
                              {template.dealTransition.from} → {template.dealTransition?.to}
                            </span>
                          )}
                      </div>
                      <p className="text-sm text-gray-600">
                        <strong>Subject:</strong> {template.subject}
                      </p>
                    </div>
                  </div>

                  {/* ✅ Updated action buttons with View option */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenPreview(template)}
                      className="flex items-center gap-1 p-2.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors border border-purple-200"
                      title="Preview template"
                    >
                      <EyeIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleOpenModal(template)}
                      className="flex items-center gap-1 p-2.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200"
                      title="Edit template"
                    >
                      <EditIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(template._id)}
                      className="flex items-center gap-1 p-2.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-200"
                      title="Delete template"
                    >
                      <DeleteIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <EmailTemplateForm
        isOpen={showModal}
        onClose={handleCloseModal}
        statuses={statuses}
        template={editingTemplate}
        onSave={handleSaveTemplateSuccess}
      />

      {/* ✅ NEW: Preview Modal */}
      <EmailTemplatePreview
        isOpen={showPreview}
        onClose={handleClosePreview}
        template={previewTemplate}
      />
    </div>
  );
};

export default EmailNotifications;
