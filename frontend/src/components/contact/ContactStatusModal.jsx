import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getChipColor } from "../../utils/contactConstants";
import useContactLifecycleStore from "../../store/useContactLifecycleStore";

/*
 * The one place a contact's lifecycle is edited.
 *
 * A contact's position in the lifecycle is TWO fields that must agree —
 * lifecycleStage ("Customer") and stageStatus ("Won"). The backend validates
 * the combination and never infers one from the other on a write, so any UI
 * that changes a status has to send both. Picking the stage first and then a
 * status from within that stage makes an invalid pair unrepresentable: the
 * status list is always scoped to the selected stage, and changing the stage
 * resets the status to that stage's default.
 *
 * Stages and statuses come from useContactLifecycleStore, backed by the
 * organization's ContactLifecycleSettings (Settings -> Contact Lifecycle) —
 * the single source of truth. This component defines none of its own.
 */
const ContactStatusModal = ({ contact, isOpen, onClose, onSave }) => {
    const [selectedStage, setSelectedStage] = useState("Lead");
    const [selectedStatus, setSelectedStatus] = useState("New");
    const [saving, setSaving] = useState(false);
    const lifecycleStageOptions = useContactLifecycleStore((s) => s.lifecycleStageOptions);
    const allLifecycleStages = useContactLifecycleStore((s) => s.allLifecycleStages);
    const defaultStatusForStage = useContactLifecycleStore((s) => s.defaultStatusForStage);
    const fetchStages = useContactLifecycleStore((s) => s.fetchStages);

    useEffect(() => {
        fetchStages();
    }, [fetchStages]);

    // Re-seed from the contact each time the modal opens, so reopening after a
    // cancel doesn't show the abandoned selection.
    useEffect(() => {
        if (!isOpen || !contact) return;
        setSelectedStage(contact.lifecycleStage || "Lead");
        setSelectedStatus(contact.stageStatus || "New");
    }, [isOpen, contact]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape" && isOpen && !saving) onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [isOpen, saving, onClose]);

    if (!isOpen || !contact) return null;

    // Moving stage always lands on that stage's default status rather than
    // keeping a status the new stage doesn't have.
    const handleStageChange = (nextStage) => {
        setSelectedStage(nextStage);
        setSelectedStatus(defaultStatusForStage(nextStage));
    };

    const isUnchanged =
        selectedStage === (contact.lifecycleStage || "Lead") &&
        selectedStatus === (contact.stageStatus || "New");

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(contact._id, selectedStage, selectedStatus);
            onClose();
        } catch {
            // onSave surfaces its own toast; keep the modal open so the user
            // can retry or correct the selection.
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-[10000] p-4"
            onClick={() => !saving && onClose()}
        >
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">Change Status</h3>
                        <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[18rem]">
                            {contact.name || "Contact"}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Lifecycle stage
                        </label>
                        <select
                            value={selectedStage}
                            onChange={(e) => handleStageChange(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {allLifecycleStages.map((stage) => (
                                <option key={stage} value={stage}>
                                    {stage}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Status
                        </label>
                        <div className="grid grid-cols-1 gap-2">
                            {lifecycleStageOptions[selectedStage]?.map((status) => (
                                <button
                                    key={status}
                                    type="button"
                                    onClick={() => setSelectedStatus(status)}
                                    className={`w-full px-4 py-2.5 rounded-lg border text-center font-semibold text-sm transition-all duration-200 ${selectedStatus === status
                                        ? `${getChipColor(status)} ring-2 ring-blue-400 ring-offset-1`
                                        : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                                        }`}
                                >
                                    {status}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-200 flex gap-2">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-60"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || isUnchanged}
                        className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-60"
                    >
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ContactStatusModal;
