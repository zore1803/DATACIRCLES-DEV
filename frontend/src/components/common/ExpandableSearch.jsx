import { useRef, useState } from "react";
import { X } from "lucide-react";
import SearchIcon from "./SearchIcon";

// Icon-only search that expands on focus; same behaviour as the Companies/Deals toolbars.
const ExpandableSearch = ({ value, onChange, placeholder = "Search..." }) => {
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef(null);

  return (
    <div
      className={`relative h-10 flex items-center border rounded-full bg-white transition-all duration-300 ease-in-out hover:bg-gray-50 focus-within:border-[#0085FF] focus-within:hover:bg-white ${
        value ? "border-[#0085FF]" : "border-[#E1E4EA]"
      } ${expanded ? "w-full sm:w-[416px]" : "w-10"} max-w-full`}
    >
      <SearchIcon
        className="absolute left-3 cursor-pointer z-10 flex-shrink-0 top-1/2 -translate-y-1/2 w-4 h-4 text-[#525866]"
        onClick={() => {
          setExpanded(true);
          inputRef.current?.focus();
        }}
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setExpanded(true)}
        onBlur={() => {
          if (!value) setExpanded(false);
        }}
        className={`w-full h-full pl-9 pr-9 bg-transparent text-sm focus:outline-none transition-opacity duration-200 font-inter cursor-pointer ${expanded ? "opacity-100 focus:cursor-text" : "opacity-0"}`}
        placeholder={placeholder}
      />
      {expanded && value && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-5 h-5 rounded-full text-gray-900 hover:bg-gray-100 transition-colors"
        >
          <X className="w-3.5 h-3.5" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
};

export default ExpandableSearch;
