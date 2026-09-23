import React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import ContactFieldSettings from "../settings/ContactFieldSettings";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

/*
 * Right-hand drawer wrapping the same ContactFieldSettings editor Settings ->
 * Contact Fields uses — not a separate quick-add form, so whatever's added,
 * edited or reordered here is the exact same underlying data (same fetch,
 * same save calls), no duplicated logic to fall out of sync. Opened from the
 * Contact overview's "+ Add custom fields" link instead of navigating away to
 * Settings — the exact same pattern DealFieldDrawer.jsx uses for deals, kept
 * consistent on purpose rather than inventing a second UI for the same idea.
 */
const ContactFieldDrawer = ({ isOpen, onClose }) => {
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100004]">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <aside
        role="dialog"
        aria-label="Contact fields"
        className="fixed dc-panel-card w-[calc(100%-3rem)] lg:w-[70vw] bg-white shadow-2xl flex flex-col overflow-hidden animate-slideInRight"
      >
        <header className="flex-shrink-0 flex items-center justify-between gap-3 px-5 h-14 border-b border-[#E1E4EA]">
          <span
            style={{ fontFamily: "Inter", fontWeight: 600, fontSize: "14px", letterSpacing: "-0.04em", color: "#44444A" }}
          >
            Contact Fields
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          <ContactFieldSettings />
        </div>
      </aside>
    </div>,
    document.body
  );
};

export default ContactFieldDrawer;
