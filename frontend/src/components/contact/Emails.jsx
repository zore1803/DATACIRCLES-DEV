import React, { useState, useEffect } from 'react';
import { X, Mail, Clock, User, CheckCircle, XCircle, AlertCircle, Send } from "lucide-react";
import API from "../../services/api";
import toast from 'react-hot-toast';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import AppToaster from "../AppToaster";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

const Emails = ({ contactId, contactEmail }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [isSliding, setIsSliding] = useState(false);
  const [shouldRender, setShouldRender] = useState(true);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const user = JSON.parse(localStorage.getItem('user'));

  useBodyScrollLock(showCompose);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await API.get(`/email/recipient/contact/${contactId}`);
        setLogs(res.data);
      } catch (err) {
        toast.error(err.response?.data?.error || 'Failed to load email history', {
          style: {
            zIndex: 99999,
            background: '#fee2e2',
            border: '1px solid #fca5a5',
            borderRadius: '12px',
            color: '#991b1b',
            padding: '12px 16px',
            fontSize: '14px',
            fontWeight: '500'
          }
        });
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [contactId]);

  useEffect(() => {
    if (showCompose) {
      setShouldRender(true);
      setTimeout(() => setIsSliding(true), 10);
      // Seed a house-style scaffold so every message opens with a
      // consistent greeting and sign-off. Only when the body is still empty
      // so we never overwrite a draft.
      setBody((prev) => {
        if (prev && prev !== '<p><br></p>') return prev;
        const senderName = user?.name || '';
        return `<p>Dear Sir/Madam,</p><p><br></p><p><br></p><p>Regards,</p><p>${senderName}</p>`;
      });
    } else {
      setIsSliding(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [showCompose]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!subject || !body || body === '<p><br></p>') {
      toast.error('Subject and body cannot be empty', {
        style: {
          zIndex: 99999,
          background: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '12px',
          color: '#92400e',
          padding: '12px 16px',
          fontSize: '14px',
          fontWeight: '500'
        }
      });
      return;
    }

    setSending(true);
    try {
      await API.post('/email/send', {
        recipientType: 'contact',
        recipientId: contactId,
        subject,
        body,
        fromEmail: user.email
      });

      const res = await API.get(`/email/recipient/contact/${contactId}`);
      setLogs(res.data);

      setShowCompose(false);
      setSubject('');
      setBody('');
      toast.success('Email sent successfully', {
        style: {
          zIndex: 99999,
          background: '#d1fae5',
          border: '1px solid #34d399',
          borderRadius: '12px',
          color: '#065f46',
          padding: '12px 16px',
          fontSize: '14px',
          fontWeight: '500'
        }
      });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send email', {
        style: {
          zIndex: 99999,
          background: '#fee2e2',
          border: '1px solid #fca5a5',
          borderRadius: '12px',
          color: '#991b1b',
          padding: '12px 16px',
          fontSize: '14px',
          fontWeight: '500'
        }
      });
    } finally {
      setSending(false);
    }
  };

  const quillModules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline'],
      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
      ['link', 'blockquote'],
      ['clean']
    ]
  };

  const quillFormats = [
    'header', 'bold', 'italic', 'underline',
    'list', 'bullet', 'link', 'blockquote'
  ];

  const getStatusIcon = (status) => {
    switch (status) {
      case 'sent':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return <AlertCircle className="w-4 h-4 text-yellow-600" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'sent':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'failed':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    }
  };

  return (
    <div className="min-h-screen">
      {/* Safe area for laptop notch */}
      <div className="pt-safe-top">
        <AppToaster />

        <div>
          {/* Header Section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Mail className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">Email Communication</h1>
                  <p className="text-sm text-gray-600 mt-1">
                    Manage emails for <span className="font-medium text-gray-900">{contactEmail}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCompose(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium text-sm shadow-sm transition-all duration-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                <Send className="w-4 h-4" />
                Compose New Email
              </button>
            </div>
          </div>

          {/* Compose Sliding Panel */}
          {shouldRender && (
            <>
              <div
                className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300 ease-in-out"
                style={{ opacity: isSliding ? 1 : 0 }}
                onClick={() => setShowCompose(false)}
              />
              <div
                className={`fixed dc-panel-card dc-panel-w z-[10001] bg-white shadow-2xl overflow-y-auto transform transition-transform duration-300 ease-in-out ${
                  isSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"
                }`}
              >
                <div className="h-full flex flex-col">
                  {/* Header */}
                  <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                          <Mail className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">Compose Email</h3>
                          <p className="text-sm text-gray-600">Send a new message</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowCompose(false)}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Form Content */}
                  <div className="flex-1 overflow-y-auto">
                    <form onSubmit={handleSend} className="p-6 space-y-6">
                      {/* From Field */}
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">
                          <User className="w-4 h-4 inline mr-2" />
                          From
                        </label>
                        <input
                          type="email"
                          value={user.email}
                          disabled
                          className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed text-sm font-medium"
                        />
                      </div>

                      {/* To Field */}
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">
                          <Mail className="w-4 h-4 inline mr-2" />
                          To
                        </label>
                        <input
                          type="email"
                          value={contactEmail}
                          disabled
                          className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed text-sm font-medium"
                        />
                      </div>

                      {/* Subject Field */}
                      <div className="space-y-2">
                        <label htmlFor="email-subject" className="block text-sm font-semibold text-gray-700">
                          Subject *
                        </label>
                        <input
                          id="email-subject"
                          type="text"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm outline-none transition-all duration-200 hover:border-gray-400"
                          placeholder="Enter email subject..."
                          required
                        />
                      </div>

                      {/* Body Field */}
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">
                          Message *
                        </label>
                        <div className="border border-gray-300 rounded-lg overflow-hidden hover:border-gray-400 transition-colors duration-200">
                          <ReactQuill
                            value={body}
                            onChange={setBody}
                            modules={quillModules}
                            formats={quillFormats}
                            className="bg-white min-h-[200px]"
                            theme="snow"
                            placeholder="Write your email message here..."
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Use the toolbar above to format your message
                        </p>
                      </div>
                    </form>
                  </div>

                  {/* Footer Actions */}
                  <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setShowCompose(false)}
                        className="px-6 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors duration-200"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        onClick={handleSend}
                        disabled={sending}
                        className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 min-w-[100px] justify-center"
                      >
                        {sending ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            Send Email
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Email History */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <Clock className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Email History</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {logs.length === 0 
                      ? "No emails sent yet" 
                      : `${logs.length} email${logs.length > 1 ? 's' : ''} in conversation`
                    }
                  </p>
                </div>
              </div>
            </div>

            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-6">
                <div className="p-4 bg-gray-100 rounded-full mb-4">
                  <Mail className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No emails yet</h3>
                <p className="text-gray-500 text-center max-w-md">
                  Start the conversation by composing and sending your first email to this contact.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Date & Time
                      </th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Subject
                      </th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Status
                      </th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        From
                      </th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        To
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {logs.map((log, index) => (
                      <tr 
                        key={log._id} 
                        className={`hover:bg-gray-50 transition-colors duration-150 ${
                          index % 2 === 0 ? 'bg-white' : 'bg-gray-25'
                        }`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-gray-400" />
                            <div className="text-sm">
                              <div className="font-medium text-gray-900">
                                {new Date(log.createdAt).toLocaleDateString('en-US', { 
                                  month: 'short', 
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </div>
                              <div className="text-gray-500">
                                {new Date(log.createdAt).toLocaleTimeString('en-US', { 
                                  hour: '2-digit', 
                                  minute: '2-digit',
                                  hour12: true
                                })}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900 max-w-xs truncate" title={log.subject}>
                            {log.subject}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${getStatusColor(log.status)}`}>
                            {getStatusIcon(log.status)}
                            {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 max-w-xs truncate" title={log.fromEmail}>
                            {log.fromEmail}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 max-w-xs truncate" title={log.toEmail}>
                            {log.toEmail}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Emails;
