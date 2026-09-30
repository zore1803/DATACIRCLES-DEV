import { useEffect, useRef } from "react";
import PlusIcon from "./PlusIcon";

// "New Folder" button that turns into an inline name field with Cancel / Create.
const InlineNewFolder = ({ open, onOpen, onClose, value, onChange, onCreate, creating }) => {
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <div className="flex items-center flex-shrink-0">
      <div
        className={`flex items-center gap-2 overflow-hidden transition-all duration-500 ease-in-out ${
          open ? "max-w-[300px] sm:max-w-[420px] opacity-100 mr-2" : "max-w-0 opacity-0 mr-0 pointer-events-none"
        }`}
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCreate();
            if (e.key === "Escape") onClose();
          }}
          placeholder="Enter folder name..."
          maxLength={50}
          tabIndex={open ? 0 : -1}
          className="h-10 w-40 sm:w-64 px-4 border border-[#0085FF] rounded-full text-sm bg-white outline-none focus:ring-2 focus:ring-blue-100"
        />
        <button
          onClick={onClose}
          tabIndex={open ? 0 : -1}
          className="h-10 px-4 rounded-full border border-[#E1E4EA] bg-white text-sm font-medium text-[#525866] hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
      <button
        onClick={open ? onCreate : onOpen}
        disabled={open && creating}
        className="inline-flex items-center justify-center gap-2 h-10 px-4 bg-[#0085FF] text-white text-sm font-medium rounded-full hover:bg-blue-600 focus:outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <PlusIcon className="w-4 h-4" />
        {open ? (creating ? "Creating..." : "Create") : "New Folder"}
      </button>
    </div>
  );
};

export default InlineNewFolder;
