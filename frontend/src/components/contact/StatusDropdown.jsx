import React, { useEffect, useRef } from "react";
import { ChevronDown, Check } from "lucide-react";
import { getBadgeColor } from "../../utils/contactConstants";
import useContactLifecycleStore from "../../store/useContactLifecycleStore";

/*
 * Inline status picker on the contacts table.
 *
 * Two things were wrong here and both could corrupt data:
 *
 *  1. It rendered one FLAT list of every status, so a Lead could be set to
 *     "Won" — a status that only exists under Customer. It sent stageStatus
 *     alone, leaving lifecycleStage on "Lead". Mongoose's per-field enums
 *     accept each half in isolation and findOneAndUpdate skips the model's
 *     pre-save pair check, so that impossible contact SAVED.
 *  2. The flat list came from `lifecycleStageStatuses`, which included
 *     "Lost Lead" and "Won Lead" — values the backend enum rejects outright.
 *
 * Now the list is grouped by lifecycle stage, so what a status belongs to is
 * visible before you click it, and picking one sends BOTH lifecycleStage and
 * stageStatus, derived from the status itself. Stages/statuses come from
 * useContactLifecycleStore (Settings -> Contact Lifecycle) — this component
 * defines none of its own.
 */
const StatusDropdown = ({ contact, onUpdate, isOpen, onToggle }) => {
    const dropdownRef = useRef(null);
    const lifecycleStageOptions = useContactLifecycleStore((s) => s.lifecycleStageOptions);
    const allLifecycleStages = useContactLifecycleStore((s) => s.allLifecycleStages);
    const getLifecycleStageForStatus = useContactLifecycleStore((s) => s.getLifecycleStageForStatus);
    const fetchStages = useContactLifecycleStore((s) => s.fetchStages);

    useEffect(() => {
        fetchStages();
    }, [fetchStages]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                if (isOpen) onToggle(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen, onToggle]);

    const currentStatus = contact.stageStatus || "New";

    const handleSelect = (e, status) => {
        e.stopPropagation();
        onToggle(null);
        if (status === currentStatus) return;
        // Both fields, always — the API validates the pair and never infers
        // one from the other.
        onUpdate(contact._id, getLifecycleStageForStatus(status), status);
    };

    return (
        <div className="relative inline-block text-left" ref={dropdownRef}>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onToggle(isOpen ? null : contact._id);
                }}
                className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all hover:ring-2 hover:ring-opacity-50 ${getBadgeColor(
                    currentStatus
                )}`}
            >
                <span>{currentStatus}</span>
                <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                />
            </button>

            {isOpen && (
                <div className="absolute left-0 mt-2 w-52 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-top-left">
                    {allLifecycleStages.map((stage) => (
                        <div key={stage}>
                            <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                                {stage}
                            </div>
                            {lifecycleStageOptions[stage].map((status) => (
                                <button
                                    key={status}
                                    onClick={(e) => handleSelect(e, status)}
                                    className={`w-full text-left px-3 py-1.5 text-[13px] transition-colors hover:bg-gray-50 flex items-center justify-between ${currentStatus === status
                                        ? "bg-blue-50 text-blue-700 font-bold"
                                        : "text-gray-700"
                                        }`}
                                >
                                    <span>{status}</span>
                                    {currentStatus === status && <Check className="w-3.5 h-3.5" />}
                                </button>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default StatusDropdown;
