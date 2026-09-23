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
        className="fixed dc-panel-card w-[calc(100%-3rem)] lg:w-[70vw] bg-white shadow-2xl flex flex-col overflow-hidden animate-slideInRight"
      >
        <header className="flex-shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-b border-[#D9D9D9] bg-white">
          <div>
            <h2 className="text-[15px] font-semibold leading-6 text-[#1C1B1F]">
              Contact Lifecycle
            </h2>
            <p className="text-[12px] text-[#78788D] mt-0.5">Configure lifecycle stages and statuses</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="w-5 h-5 flex items-center justify-center text-[#1C1B1F] hover:opacity-70 transition-opacity flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          <ContactLifecycleSettings />
        </div>
      </aside>
    </div>,
    document.body
  );
};

export default ContactLifecycleDrawer;
