import DeleteIcon from "./DeleteIcon";
import DownloadIcon from "./DownloadIcon";
import SelectAllIcon from "./SelectAllIcon";
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Edit2,
  ListChecks,
  StickyNote,
  X,
} from "lucide-react";

/**
 * Bulk-selection action strip, shared by every list that supports multi-select.
 *
 * Visual contract is taken from the Companies list (pages/Companies.jsx), which
 * is the reference implementation: action buttons on the left, selection count
 * and Select/Deselect All on the right, every button icon + label, `px-4 py-2`.
 * Keep the two in sync — if a button is added here, add it there too.
 *
 * Every action is optional; a button only renders when its handler is supplied,
 * so each list shows exactly the actions it actually supports.
 *
 * `exportFormats` (e.g. ["excel", "pdf"]) is opt-in: when given, the Export
 * button opens a small Excel / PDF picker and calls `onExport(format)`. Without
 * it, Export calls `onExport()` straight away, exactly as before.
 *
 * `isClosing` drives the exit animation. Pair it with `useBulkStrip()` from
 * hooks/useBulkSelection — the strip has to stay mounted for one animation beat
 * after the selection empties, or the slide-out never plays.
 */
const BulkActionBar = ({
  selectedCount,
  entityName = 'item',
  onSelectAll,
  onDeselectAll,
  onExport,
  exportFormats,
  onAddNote,
  onAddTask,
  onDelete,
  onUpdateStatus,
  onCancel,
  isDeleting = false,
  isClosing = false,
  // Pages that render this inside their own fixed toolbar pass `bare` — a
  // bordered card inside that bar would be chrome stacked on chrome.
  bare = false,
}) => {
  // Left side is ONE joined segmented control (matching pages/Companies.jsx):
  // white fill, gray border, black label, the icon carrying each action's
  // accent colour. Only rounds the two outer corners and pulls each button 1px
  // onto its neighbour (-ml-px) so touching borders don't double into a seam.
  // Every action is optional — a button renders only when its handler exists —
  // so the first/last rounding is computed from what actually renders.
  const [showFormatPicker, setShowFormatPicker] = useState(false);
  const hasFormatPicker = Array.isArray(exportFormats) && exportFormats.length > 0;
  const FORMAT_LABELS = { excel: 'Excel', pdf: 'PDF' };

  const leftButtons = [
    onExport && {
      key: 'export',
      label: 'Export',
      Icon: DownloadIcon,
      iconClass: 'text-green-600',
      onClick: hasFormatPicker ? () => setShowFormatPicker(true) : onExport,
    },
    onAddNote && { key: 'note', label: 'Add Note', Icon: StickyNote, iconClass: 'text-emerald-600', onClick: onAddNote },
    onAddTask && { key: 'task', label: 'Add Task', Icon: ListChecks, iconClass: 'text-indigo-600', onClick: onAddTask },
    onUpdateStatus && { key: 'update', label: 'Bulk Update', Icon: Edit2, iconClass: 'text-blue-600', onClick: onUpdateStatus },
    onDelete && { key: 'delete', label: 'Delete', Icon: DeleteIcon, iconClass: 'text-red-600', onClick: onDelete, disabled: isDeleting },
    onCancel && { key: 'cancel', label: 'Cancel', Icon: X, iconClass: 'text-gray-500', onClick: onCancel },
  ].filter(Boolean);

  return (
    <div
      className={`${
        isClosing ? 'animate-slideOutRight' : 'animate-slideInLeft'
      } flex flex-nowrap items-center justify-between gap-4 w-full px-4 overflow-x-auto ${
        bare ? "" : "bg-white border border-[#E1E4EA] rounded-xl mb-4"
      }`}
      style={{ minHeight: 44 }}
    >
      {/* Never wraps: on a wide sidebar the strip used to break onto a
          second line and overlap the table header underneath it. It stays one
          row and scrolls horizontally instead. */}
      <div className="flex flex-nowrap items-center flex-shrink-0 py-2">
        {leftButtons.map((btn, i) => (
          <button
            key={btn.key}
            onClick={btn.onClick}
            disabled={btn.disabled}
            className={`h-10 px-4 bg-white border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:z-10 transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap disabled:opacity-50 ${
              i === 0 ? '' : '-ml-px'
            } ${i === leftButtons.length - 1 ? 'rounded-r-[25px]' : ''}`}
            style={{
              // 25px on the group's outer corners only — the joins between
              // segments stay square so the buttons still read as one strip.
              borderTopLeftRadius: i === 0 ? 25 : undefined,
              borderBottomLeftRadius: i === 0 ? 25 : undefined,
            }}
          >
            <btn.Icon className={`w-4 h-4 ${btn.iconClass}`} />
            {btn.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-shrink-0 py-2">
        <SelectAllIcon className="w-5 h-5 text-blue-600 flex-shrink-0" />
        <span className="text-blue-800 font-semibold text-sm font-inter whitespace-nowrap">
          {selectedCount} {entityName}
          {selectedCount !== 1 ? 's' : ''} selected
        </span>
        {onSelectAll && (
          <button
            onClick={onSelectAll}
            className="h-10 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-[25px] hover:bg-gray-50 focus:outline-none transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
          >
            <SelectAllIcon className="w-4 h-4" />
            Select All
          </button>
        )}
        {onDeselectAll && (
          <button
            onClick={onDeselectAll}
            className="h-10 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-[25px] hover:bg-gray-50 focus:outline-none transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
          >
            <X className="w-4 h-4" />
            Deselect All
          </button>
        )}
      </div>

      {showFormatPicker &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[10000] p-4"
            onClick={() => setShowFormatPicker(false)}
          >
            <div
              className="bg-white rounded-xl shadow-2xl w-full max-w-xs p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-bold text-gray-900">Export {selectedCount} selected</h3>
              <p className="text-xs text-gray-500 mt-1 mb-4">Choose a format</p>
              <div className="flex gap-2">
                {exportFormats.map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => {
                      setShowFormatPicker(false);
                      onExport(fmt);
                    }}
                    className="flex-1 py-2.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-800 hover:bg-green-600 hover:text-white hover:border-green-600 transition-colors"
                  >
                    {FORMAT_LABELS[fmt] || fmt}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowFormatPicker(false)}
                className="w-full mt-3 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default BulkActionBar;
