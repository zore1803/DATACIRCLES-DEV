import React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import KanbanSettings from "../settings/KanbanSettings";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

/*
 * Right-hand drawer wrapping the same KanbanSettings editor Settings ->
 * Pipeline uses — not a separate quick-add form, so whatever's added, renamed,
 * reordered or removed here is the exact same underlying KanbanBoard data
 * (same fetch, same save calls), no duplicated logic to fall out of sync.
 * Opened from the Deal overview's "Current: {status}" badge next to Deal
 * Journey instead of navigating away to Settings — the same pattern
 * DealFieldDrawer already uses for custom fields, kept consistent here rather
 * than inventing a second UI for the same idea.
 */
const PipelineStageDrawer = ({ isOpen, onClose }) => {
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100004]">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <aside
        role="dialog"
        aria-label="Pipeline stages"
        className="fixed dc-panel-card dc-panel-w bg-white shadow-2xl flex flex-col overflow-hidden animate-slideInRight"
      >
        <header className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[#E1E4EA] bg-white">
          <div>
            <h2 className="text-[15px] font-semibold leading-6 text-[#1C1B1F]">
              Pipeline Stages
            </h2>
            <p className="text-[12px] text-[#78788D] mt-0.5">Configure kanban board layouts</p>
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
          <KanbanSettings embedded />
        </div>

        <footer className="flex-shrink-0 px-5 py-3 border-t border-[#E1E4EA] bg-[#FAFBFC] flex items-center justify-between gap-3">
          <p className="text-[11px] text-[#99A0AE] min-w-0 truncate">
            Changes save automatically and apply to all deals.
          </p>
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

export default PipelineStageDrawer;
