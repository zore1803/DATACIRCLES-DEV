import React, { useEffect, useState, useRef, useMemo } from "react";
import API from "../../services/api";

// How many matches the server returns per query in remote mode.
const REMOTE_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 250;

// List endpoints return either a bare array or an object wrapping one.
const extractList = (data) =>
  Array.isArray(data) ? data : Object.values(data || {}).find(Array.isArray) || [];

const SearchableDropdown = ({
  options,
  value,
  onChange,
  placeholder,
  displayKey = "name",
  valueKey = "_id",
  required = false,
  error = null,
  className = "",
  // Opt-in smaller variant (12px text, 32px pill) for forms that use the
  // compact field system — off by default so every other caller of this
  // shared component keeps its existing 14px/48px look.
  compact = false,
  disabled = false,
  // Opt-in server-side mode, e.g. { endpoint: "/companies" }. Nothing is
  // loaded until the dropdown opens; typing queries the server with `search`
  // (debounced) and returns at most REMOTE_LIMIT rows. The currently selected
  // record is fetched by id, so editing keeps its label even when it isn't in
  // the first page of results. Without it, `options` is used exactly as before.
  // Optional `remote.onSelectedLoaded(record)` is called when the selected
  // record has been fetched by id (e.g. while editing), for callers that need
  // more than its label — such as a vendor's address for GST.
  //
  // `onChange(value, option)` also hands back the chosen record as a second
  // argument (undefined when the selection is cleared); existing callers that
  // only read `value` are unaffected.
  remote = null,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef(null);

  const remoteEndpoint = remote?.endpoint;
  // Optional per-row decoration, e.g. adding a combined display label.
  const toDisplayOption = (o) => (remote?.map ? remote.map(o) : o);
  const remoteParamsKey = JSON.stringify(remote?.params || {});
  const [remoteOptions, setRemoteOptions] = useState([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [selectedRemote, setSelectedRemote] = useState(null);
  const requestIdRef = useRef(0);
  const onSelectedLoadedRef = useRef(remote?.onSelectedLoaded);
  onSelectedLoadedRef.current = remote?.onSelectedLoaded;

  // Search while open. The request id guards against a slow earlier response
  // overwriting a newer one.
  useEffect(() => {
    if (!remoteEndpoint || !isOpen) return;
    const requestId = ++requestIdRef.current;
    const timer = setTimeout(async () => {
      setRemoteLoading(true);
      try {
        const res = await API.get(remoteEndpoint, {
          params: {
            ...JSON.parse(remoteParamsKey),
            ...(searchTerm ? { search: searchTerm } : {}),
            limit: REMOTE_LIMIT,
          },
        });
        if (requestId === requestIdRef.current)
          setRemoteOptions(extractList(res.data).map(toDisplayOption));
      } catch {
        if (requestId === requestIdRef.current) setRemoteOptions([]);
      } finally {
        if (requestId === requestIdRef.current) setRemoteLoading(false);
      }
    }, searchTerm ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [remoteEndpoint, remoteParamsKey, isOpen, searchTerm]);

  // Load the selected record by id if it isn't already the one we have.
  useEffect(() => {
    if (!remoteEndpoint || !value) {
      setSelectedRemote(null);
      return;
    }
    if (selectedRemote?.[valueKey] === value) return;
    let cancelled = false;
    API.get(`${remoteEndpoint}/${value}`)
      .then((res) => {
        if (cancelled) return;
        const record = toDisplayOption(res.data);
        setSelectedRemote(record);
        onSelectedLoadedRef.current?.(record);
      })
      .catch(() => {
        if (!cancelled) setSelectedRemote(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteEndpoint, value]);

  const filteredOptions = useMemo(() => {
    if (remoteEndpoint) return remoteOptions;
    if (!searchTerm) return options;
    return options.filter((option) =>
      option[displayKey].toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [remoteEndpoint, remoteOptions, options, searchTerm, displayKey]);

  const selectedOption = remoteEndpoint
    ? (selectedRemote?.[valueKey] === value ? selectedRemote : undefined)
    : options.find((option) => option[valueKey] === value);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (option) => {
    // Remember the record just picked so the by-id effect above doesn't fetch
    // it again to learn its label.
    if (remoteEndpoint) setSelectedRemote(option);
    onChange(option[valueKey], option);
    setIsOpen(false);
    setSearchTerm("");
  };

  const handleClear = () => {
    onChange("");
    setIsOpen(false);
    setSearchTerm("");
  };

  // Determine the border color based on validation state
  const getBorderColor = () => {
    if (error) return 'border-red-500 focus:ring-red-500';
    return isOpen ? 'border-blue-500 ring-1 ring-blue-500' : (compact ? 'border-[#1F2937]/10' : 'border-[#E0E0E1]');
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <div
        className={`w-full border transition-all font-inter flex items-center justify-between ${compact ? "rounded-full px-3 h-[38px]" : "rounded-[25px] px-4 h-12"} ${getBorderColor()} ${disabled ? "bg-gray-50 cursor-not-allowed opacity-70" : "bg-white cursor-pointer"}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span className={`truncate ${compact ? "text-[13px]" : "text-[14px]"} ${selectedOption ? (compact ? "text-[#1F2937]" : "text-gray-900 font-medium") : (compact ? "text-[#1F2937] opacity-50" : "text-[#A0A0A0]")}`}>
          {selectedOption ? selectedOption[displayKey] : placeholder}
        </span>
        <div className="flex items-center gap-2">
          {selectedOption && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Hidden input for HTML5 validation */}
      {required && (
        <input
          type="text"
          value={value || ""}
          onChange={() => { }}
          required
          className="absolute inset-0 opacity-0 pointer-events-none -z-10"
          tabIndex={-1}
        />
      )}

      {isOpen && (
        <div className="absolute z-[10010] w-full mt-2 bg-white border border-[#E0E0E1] rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
          <div className="p-2 border-b border-[#F2F2F7]">
            <input
              type="text"
              placeholder={`Search ${placeholder.toLowerCase()}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-8 px-3 text-[13px] border border-[#E0E0E1] rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-inter placeholder:text-[#A0A0A0]"
              autoFocus
            />
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {filteredOptions.length > 0 ? (
              <>
                <div
                  className="px-3 py-1.5 text-[13px] text-gray-400 hover:bg-[#F2F2F7] cursor-pointer transition-colors italic border-b border-[#F2F2F7]"
                  onClick={handleClear}
                >
                  Clear selection
                </div>
                {filteredOptions.map((option) => (
                  <div
                    key={option[valueKey]}
                    className={`px-3 py-1.5 text-[13px] cursor-pointer hover:bg-[#F2F2F7] transition-all font-inter ${option[valueKey] === value
                        ? "bg-[#F2F2F7] text-blue-600 font-bold"
                        : "text-gray-700"
                      }`}
                    onClick={() => handleSelect(option)}
                  >
                    {option[displayKey]}
                  </div>
                ))}
              </>
            ) : (
              <div className="px-3 py-4 text-[13px] text-gray-400 text-center font-inter italic">
                {remoteEndpoint && remoteLoading ? "Searching..." : "No options found"}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableDropdown;