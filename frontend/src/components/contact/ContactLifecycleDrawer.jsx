import React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import ContactLifecycleSettings from "../settings/ContactLifecycleSettings";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

/*
 * Right-hand drawer wrapping the same ContactLifecycleSettings editor
 * Settings -> Contact Lifecycle uses — the org-configurable stage/status map
 * (ContactLifecycleSettings on the backend) that every contact lifecycle
 * dropdown, the Kanban board and this page's own progress bar read through
 * useContactLifecycleStore. Opened from the Contact overview's lifecycle bar
 * instead of navigating away to Settings, mirroring how DealFieldDrawer opens
 * the Deal field editor and ContactFieldDrawer opens the contact field editor.
 */
const ContactLifecycleDrawer = ({ isOpen, onClose }) => {
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100004]">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <aside
        role="dialog"
        aria-label="Contact lifecycle stages"
        className="fixed dc-panel-card dc-panel-w bg-white shadow-2xl flex flex-col overflow-hidden animate-slideInRight"
      >
        <header className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[#E1E4EA] bg-white">
          <div>
            <h2 className="text-[15px] font-semibold leading-6 text-[#1C1B1F]">
              Contact Lifecycle
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="self-start p-2 -mr-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          <ContactLifecycleSettings embedded />
        </div>

        <footer className="flex-shrink-0 px-5 py-3 border-t border-[#E1E4EA] bg-[#FAFBFC] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-5 rounded-full border border-[#E1E4EA] text-[13px] font-medium text-[#1F2937] hover:bg-gray-50 transition-colors flex-shrink-0"
          >
            Close
          </button>
        </footer>
      </aside>
    </div>,
    document.body
  );
};

export default ContactLifecycleDrawer;
