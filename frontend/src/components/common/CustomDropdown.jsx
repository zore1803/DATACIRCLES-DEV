import React, { useEffect, useState, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { getAncestorZoom } from "../../utils/domUtils";

const CustomDropdown = ({ options, value, onChange, placeholder, className = "", buttonClassName = "", renderValue, dropdownIcon, searchable = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [menuPos, setMenuPos] = useState(null);
    const dropdownRef = useRef(null);
    const buttonRef = useRef(null);
    const menuRef = useRef(null);
    const searchRef = useRef(null);

    // The option list is portaled to document.body (see below) instead of
    // rendered as a plain absolutely-positioned child — this dropdown is used
    // inside scrollable drawers/modals (QuickItemDrawer, QuickCompanyForm,
    // etc.), and an in-place `absolute` menu was getting clipped by the
    // container's `overflow-y-auto` instead of floating above everything.
    const positionMenu = () => {
        const btn = buttonRef.current;
        if (!btn) return;
        const zoom = getAncestorZoom(document.body);
        const rect = btn.getBoundingClientRect();
        const viewportH = window.innerHeight / zoom;
        const viewportW = window.innerWidth / zoom;
        const MAX_MENU_H = 208; // matches max-h-52
        const MARGIN = 8;

        const top = rect.bottom / zoom;
        const spaceBelow = viewportH - top;
        const openUp = spaceBelow < Math.min(MAX_MENU_H, 160) && rect.top / zoom > spaceBelow;

        setMenuPos({
            top: openUp ? undefined : top,
            bottom: openUp ? viewportH - rect.top / zoom : undefined,
            left: Math.min(rect.left / zoom, viewportW - rect.width / zoom - MARGIN),
            width: rect.width / zoom,
            // Cap at MAX_MENU_H (~4 rows) instead of filling all remaining
            // viewport space below/above the trigger — a dropdown that grows
            // to match whatever room happens to be available looks broken
            // next to every other picker in the app, which all cap short.
            maxHeight: Math.min(MAX_MENU_H, Math.max(120, (openUp ? rect.top / zoom : spaceBelow) - MARGIN)),
        });
    };

    useLayoutEffect(() => {
        if (!isOpen) return;
        positionMenu();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (event) => {
            if (
                dropdownRef.current && !dropdownRef.current.contains(event.target) &&
                menuRef.current && !menuRef.current.contains(event.target)
            ) {
                setIsOpen(false);
            }
        };
        // Scroll on ANY ancestor (capture phase catches non-bubbling scroll
        // events from nested scrollable containers, not just window) closes
        // the menu rather than trying to keep a fixed-position portal glued
        // to a moving trigger. Scrolling the menu's OWN option list also
        // fires a (capture-phase) scroll event that reaches this same
        // window listener — exclude it, or scrolling to find an option
        // (e.g. a long state/country list) closes the dropdown instantly.
        const handleScroll = (event) => {
            if (menuRef.current && menuRef.current.contains(event.target)) return;
            setIsOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        window.addEventListener("scroll", handleScroll, true);
        window.addEventListener("resize", handleScroll);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            window.removeEventListener("scroll", handleScroll, true);
            window.removeEventListener("resize", handleScroll);
        };
    }, [isOpen]);

    // Reset the filter when the menu closes; focus the search box when it opens.
    useEffect(() => {
        if (!isOpen) {
            setQuery("");
        } else if (searchable) {
            // Defer so the input exists before we focus it.
            const id = setTimeout(() => searchRef.current?.focus(), 0);
            return () => clearTimeout(id);
        }
    }, [isOpen, searchable]);

    const displayValue = value || "";

    const filteredOptions = searchable
        ? options.filter((option) =>
              String(option).toLowerCase().includes(query.trim().toLowerCase())
          )
        : options;

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={buttonClassName || `w-full border border-[#E0E0E1] rounded-xl px-4 h-12 text-[14px] text-left flex items-center justify-between transition-all bg-white font-inter ${isOpen ? "ring-1 ring-blue-500 border-blue-500" : ""
                    } ${!displayValue ? "text-[#A0A0A0]" : "text-gray-900 font-medium"}`}
            >
                {renderValue ? renderValue(displayValue || placeholder) : <span className="truncate">{displayValue || placeholder}</span>}
                {dropdownIcon ? dropdownIcon : (
                    <svg
                        className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                )}
            </button>

            {isOpen && menuPos && createPortal(
                <div
                    ref={menuRef}
                    style={{
                        position: "fixed",
                        top: menuPos.top,
                        bottom: menuPos.bottom,
                        left: menuPos.left,
                        width: menuPos.width,
                        maxHeight: menuPos.maxHeight,
                        // Higher than every modal/drawer z-index in this app
                        // (the highest observed is z-[100051] in Accounting.jsx)
                        // since this is a shared component mounted inside
                        // drawers like QuickItemDrawer (z-[100005]) — the
                        // previous z-[10010] rendered the menu correctly but
                        // behind the drawer panel, invisible.
                        zIndex: 100060,
                    }}
                    className="bg-white border border-[#E0E0E1] rounded-xl shadow-xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200"
                >
                    {searchable && (
                        <div className="p-2 border-b border-[#F0F0F0] flex-shrink-0">
                            <input
                                ref={searchRef}
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search..."
                                className="w-full border border-[#E0E0E1] rounded-lg px-3 h-8 text-[13px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-[#A0A0A0] font-inter"
                            />
                        </div>
                    )}
                    <div className="overflow-y-auto py-1">
                        {filteredOptions.length === 0 ? (
                            <div className="px-3 py-1.5 text-[13px] text-gray-400 font-inter">No results</div>
                        ) : (
                            filteredOptions.map((option, index) => {
                                const isSelected = option === value;
                                return (
                                    <button
                                        key={index}
                                        type="button"
                                        onClick={() => {
                                            onChange(option);
                                            setIsOpen(false);
                                        }}
                                        className={`w-full px-3 py-1.5 text-[13px] text-left hover:bg-[#F2F2F7] transition-colors font-inter ${isSelected ? "bg-[#F2F2F7] text-blue-600 font-bold" : "text-gray-700"
                                            }`}
                                    >
                                        {option}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default CustomDropdown;
