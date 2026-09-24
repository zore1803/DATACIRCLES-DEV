// frontend/src/utils/contactConstants.js
//
// The frontend's single definition of the Contact lifecycle. It MIRRORS
// backend/constants/contactLifecycle.js exactly — that file is authoritative,
// this one exists only so the UI doesn't have to round-trip to render a
// dropdown. If the backend map changes, change it here in the same commit.
//
//   lifecycleStage          stageStatus
//   ----------------------  ------------------------------------------
//   Lead                    New | Contacted | Interested | Unqualified
//   Sales Qualified Lead    Qualified | Lost
//   Customer                Won | Churned
//
// This previously listed two statuses the backend has never accepted —
// "Lost Lead" under Lead and "Won Lead" under Customer. Selecting either sent
// a value that failed the mongoose enum outright, so they are gone. Nothing
// else may add a status here that isn't in the backend map.
//
// Every component that shows or edits a lifecycle value imports from here:
// Contacts.jsx, ContactStatusModal.jsx, StatusDropdown.jsx,
// CompanyContactsTab.jsx. No component defines its own copy.

export const lifecycleStageOptions = {
    Lead: ["New", "Contacted", "Interested", "Unqualified"],
    "Sales Qualified Lead": ["Qualified", "Lost"],
    Customer: ["Won", "Churned"],
};

export const allLifecycleStages = Object.keys(lifecycleStageOptions);
export const allStageStatuses = Object.values(lifecycleStageOptions).flat();

// Kept as an alias because existing imports use this name.
export const lifecycleStageStatuses = allStageStatuses;

// The status a stage lands on when the user picks a stage without a status —
// mirrors the backend's DEFAULT_STAGE_STATUSES.
export const defaultStageStatuses = {
    Lead: "New",
    "Sales Qualified Lead": "Qualified",
    Customer: "Won",
};

export const defaultStatusForStage = (stage) =>
    defaultStageStatuses[stage] || lifecycleStageOptions[stage]?.[0] || "New";

// Every status belongs to exactly one stage, so the stage is always
// recoverable from the status alone. This is what lets a status-only UI (a
// Kanban drop, the status dropdown) still send BOTH fields, which is what the
// backend requires — it never infers one from the other on a write.
export const getLifecycleStageForStatus = (status) => {
    for (const [stage, statuses] of Object.entries(lifecycleStageOptions)) {
        if (statuses.includes(status)) {
            return stage;
        }
    }
    return "Lead";
};

export const isValidCombination = (stage, status) =>
    !!lifecycleStageOptions[stage]?.includes(status);

// ---------------------------------------------------------------------------
// Colors. One definition per status, used by every surface (table badge,
// Kanban column, status modal) so the same status never renders in two
// different colors depending on which screen you're on.
// ---------------------------------------------------------------------------

// Terminal/negative outcomes read red, in-progress amber/blue, won green,
// churned grey.
const STATUS_TONE = {
    New: "slate",
    // Deal pipeline stages share this map so a status renders identically
    // whether it sits on a contact row or a deal row.
    Open: "blue",
    Contacted: "amber",
    Interested: "blue",
    Unqualified: "red",
    Qualified: "blue",
    Lost: "red",
    Won: "green",
    Churned: "gray",
};

const TONE_CLASSES = {
    slate: {
        column: "bg-slate-50 border-slate-200",
        badge: "bg-[#EEF2F9] text-[#56698A]",
        chip: "bg-[#EEF2F9] text-[#56698A] border-[#D6DEEC]",
    },
    amber: {
        column: "bg-amber-50 border-amber-200",
        badge: "bg-[#FDF3E6] text-[#EA9927]",
        chip: "bg-[#FDF3E6] text-[#EA9927] border-[#F7DDB8]",
    },
    blue: {
        column: "bg-blue-50 border-blue-200",
        badge: "bg-[#E6F8FD] text-[#27B4EA]",
        chip: "bg-[#E6F8FD] text-[#27B4EA] border-[#B8E9F7]",
    },
    red: {
        column: "bg-red-50 border-red-200",
        badge: "bg-[#FCEAEA] text-[#EA4B4B]",
        chip: "bg-[#FCEAEA] text-[#EA4B4B] border-[#F5C7C7]",
    },
    green: {
        column: "bg-green-50 border-green-200",
        badge: "bg-[#E6F7EF] text-[#1FA971]",
        chip: "bg-[#E6F7EF] text-[#1FA971] border-[#B9E7D3]",
    },
    gray: {
        column: "bg-gray-50 border-gray-200",
        badge: "bg-[#EEF2F9] text-[#56698A]",
        chip: "bg-[#EEF2F9] text-[#56698A] border-[#D6DEEC]",
    },
};

const toneFor = (status) => TONE_CLASSES[STATUS_TONE[status]] || TONE_CLASSES.gray;

export const getColumnColor = (status) => toneFor(status).column;
export const getBadgeColor = (status) => toneFor(status).badge;
// Bordered pill used by the status modal's selectable options.
export const getChipColor = (status) => toneFor(status).chip;
