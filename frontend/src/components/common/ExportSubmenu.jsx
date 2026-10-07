import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import DownloadIcon from "./DownloadIcon";

// "Export" row for a page's ⋮ menu that flies out "Export as Excel" /
// "Export as PDF" — the same control the Deals page has, packaged so every
// list page looks and behaves identically.
//   onExport(format): "excel" | "pdf"
//   onDone: called after a format is picked (so the parent can close its ⋮ menu)
//   itemClassName: horizontal padding to match the parent menu's rows
// The flyout opens to the right like Deals; when the ⋮ button sits so close to
// the screen edge that it would be cut off, it opens to the left instead.
const FLYOUT_WIDTH = 176 + 4 + 12; // w-44 + gap + breathing room

export default function ExportSubmenu({ onExport, onDone, disabled = false, itemClassName = "px-3" }) {
  const [open, setOpen] = useState(false);
  const [openLeft, setOpenLeft] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setOpenLeft(rect.right + FLYOUT_WIDTH > document.documentElement.clientWidth);
  }, [open]);

  const pick = (format) => {
    setOpen(false);
    onDone?.();
    onExport(format);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
        className={`w-full flex items-center gap-2 ${itemClassName} py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50`}
      >
        <DownloadIcon className="w-4 h-4 text-gray-400" />
        Export
      </button>
      {open && (
        <div
          className={`absolute top-0 z-10 w-44 bg-white border border-gray-200 rounded-lg shadow-xl ${
            openLeft ? "right-full mr-1" : "left-full ml-1"
          }`}
        >
          <button
            type="button"
            onClick={() => pick("excel")}
            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors first:rounded-t-lg flex items-center gap-2 whitespace-nowrap"
          >
            Export as Excel
          </button>
          <button
            type="button"
            onClick={() => pick("pdf")}
            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors last:rounded-b-lg flex items-center gap-2 whitespace-nowrap"
          >
            Export as PDF
          </button>
        </div>
      )}
    </div>
  );
}
