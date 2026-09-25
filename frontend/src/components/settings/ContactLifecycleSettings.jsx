// Settings -> Contact Lifecycle. The org-configurable counterpart to
// KanbanSettings.jsx (which does the same job for Deal pipeline stages): each
// stage is a name plus its list of statuses. This is now the single source of
// truth for the contact lifecycle — useContactLifecycleStore reads it, and
// every dropdown/Kanban/badge on the Contact pages reads the store instead of
// keeping its own copy.
import { useEffect, useState } from "react";
import API from "../../services/api";
import { Plus, X, Check, Layers, ChevronUp, ChevronDown as ChevronDownIcon } from "lucide-react";
import toast from "react-hot-toast";
import AppToaster from "../AppToaster";
import EditIcon from "../common/EditIcon";
import DeleteIcon from "../common/DeleteIcon";
import useContactLifecycleStore from "../../store/useContactLifecycleStore";

// `embedded` = rendered inside the ContactLifecycleDrawer rather than on the
// Settings page. The drawer supplies its own card, padding and footer hint, so
// embedded mode drops this component's outer card and trailing hint to avoid
// double-nesting.
export default function ContactLifecycleSettings({ embedded = false }) {
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [editingStageIndex, setEditingStageIndex] = useState(null);
  const [editingStageName, setEditingStageName] = useState("");
  const [newStatusInputs, setNewStatusInputs] = useState({}); // { [stageIndex]: text }
  const [expandedStageIndex, setExpandedStageIndex] = useState(null);

  const setStoreStages = useContactLifecycleStore((s) => s.setStages);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await API.get("/contact-lifecycle-settings");
      setStages(res.data?.stages || []);
    } catch (err) {
      console.error("Failed to load contact lifecycle settings", err);
      toast.error("Failed to load contact lifecycle settings");
    } finally {
      setLoading(false);
    }
  };

  const save = async (updatedStages) => {
    try {
      setSaving(true);
      const res = await API.put("/contact-lifecycle-settings", { stages: updatedStages });
      setStages(res.data.stages);
      // Every open drawer/dropdown/Kanban picks this up immediately instead
      // of waiting for its own next fetch.
      setStoreStages(res.data.stages, res.data._id);
      toast.success("Changes saved successfully!");
      return true;
    } catch (err) {
      console.error("Failed to save contact lifecycle settings", err);
      toast.error(err.response?.data?.error || "Failed to save changes");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // A status must resolve to exactly one stage, so the server rejects a new
  // stage seeded with a status another stage already uses. "New" is taken by
  // the default Lead stage, which is why every added stage used to fail — pick
  // the first name that's actually free instead.
  const firstFreeStatus = (stageName) => {
    const taken = new Set(stages.flatMap((s) => s.statuses));
    const candidates = [stageName, `${stageName} New`, "New"];
    const free = candidates.find((c) => c && !taken.has(c));
    if (free) return free;
    let n = 2;
    while (taken.has(`${stageName} ${n}`)) n += 1;
    return `${stageName} ${n}`;
  };

  const handleAddStage = async () => {
    const name = newStageName.trim();
    if (!name) {
      toast.error("Stage name cannot be empty");
      return;
    }
    if (stages.some((s) => s.name === name)) {
      toast.error("Stage already exists");
      return;
    }
    const updated = [...stages, { name, statuses: [firstFreeStatus(name)] }];
    if (await save(updated)) {
      setNewStageName("");
      // Open the stage that was just added so its seeded status is visible and
      // can be renamed straight away.
      setExpandedStageIndex(updated.length - 1);
    }
  };

  const handleDeleteStage = async (index) => {
    if (stages.length <= 1) {
      toast.error("At least one lifecycle stage is required");
      return;
    }
    if (!window.confirm(`Delete stage "${stages[index].name}" and all its statuses?`)) return;
    const updated = stages.filter((_, i) => i !== index);
    await save(updated);
  };

  const handleRenameStage = async (index) => {
    const name = editingStageName.trim();
    if (!name) {
      toast.error("Stage name cannot be empty");
      return;
    }
    if (stages.some((s, i) => i !== index && s.name === name)) {
      toast.error("Stage already exists");
      return;
    }
    const updated = stages.map((s, i) => (i === index ? { ...s, name } : s));
    if (await save(updated)) {
      setEditingStageIndex(null);
      setEditingStageName("");
    }
  };

  const moveStage = async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= stages.length) return;
    const updated = [...stages];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    await save(updated);
  };

  const handleAddStatus = async (stageIndex) => {
    const status = (newStatusInputs[stageIndex] || "").trim();
    if (!status) {
      toast.error("Status name cannot be empty");
      return;
    }
    if (stages.some((s) => s.statuses.includes(status))) {
      toast.error("Status already exists on a stage");
      return;
    }
    const updated = stages.map((s, i) =>
      i === stageIndex ? { ...s, statuses: [...s.statuses, status] } : s
    );
    if (await save(updated)) {
      setNewStatusInputs((prev) => ({ ...prev, [stageIndex]: "" }));
    }
  };

  const handleDeleteStatus = async (stageIndex, statusIndex) => {
    const stage = stages[stageIndex];
    if (stage.statuses.length <= 1) {
      toast.error("A stage needs at least one status");
      return;
    }
    const updated = stages.map((s, i) =>
      i === stageIndex ? { ...s, statuses: s.statuses.filter((_, si) => si !== statusIndex) } : s
    );
    await save(updated);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading contact lifecycle settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? "space-y-4" : "space-y-6"}>
      <AppToaster />

      <div className={embedded ? "" : "bg-white rounded-2xl border border-gray-200 shadow-sm p-6"}>
        <form
          onSubmit={(e) => { e.preventDefault(); handleAddStage(); }}
          className="flex gap-2 mb-5"
        >
          <input
            type="text"
            value={newStageName}
            onChange={(e) => setNewStageName(e.target.value)}
            placeholder="Add lifecycle stage"
            disabled={saving}
            className="flex-1 min-w-0 px-4 h-10 text-[13px] rounded-full border border-[#E1E4EA] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
          <button
            type="submit"
            disabled={!newStageName.trim() || saving}
            // Same primary treatment as the header's Upgrade Plan pill.
            className="flex-shrink-0 px-5 h-10 border border-[#0C4FCD] text-white text-[13px] font-semibold rounded-full disabled:opacity-50 transition-opacity hover:opacity-90 flex items-center gap-1.5"
            style={{
              background:
                "linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0) 100%), var(--btn-primary)",
              boxShadow: "inset 0px 0px 0px 1.8px rgba(255, 255, 255, 0.25)",
            }}
          >
            <Plus className="w-4 h-4" /> Add Stage
          </button>
        </form>

        {stages.length === 0 ? (
          <div className="text-center py-12 rounded-xl border border-[#E1E4EA]">
            <Layers className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-600">No stages yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {stages.map((stage, stageIndex) => (
              // One self-contained card per stage: the open one is marked by a
              // blue border, so it's clear which card the statuses belong to.
              <div
                key={stage.name}
                className={`rounded-xl border bg-white overflow-hidden transition-colors ${
                  embedded && expandedStageIndex === stageIndex
                    ? "border-[#158FFF]/40"
                    : "border-[#E1E4EA]"
                }`}
              >
                <div
                  className={`flex items-center gap-2 px-4 h-[52px] ${embedded ? 'cursor-pointer hover:bg-[#F5F7FA] transition-colors' : ''}`}
                  onClick={() => {
                    if (embedded) {
                      setExpandedStageIndex(prev => prev === stageIndex ? null : stageIndex);
                    }
                  }}
                >
                  {!embedded && (
                    <div className="flex flex-col -my-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        disabled={saving || stageIndex === 0}
                        onClick={() => moveStage(stageIndex, -1)}
                        className="text-gray-400 hover:text-gray-700 disabled:opacity-30"
                        title="Move up"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={saving || stageIndex === stages.length - 1}
                        onClick={() => moveStage(stageIndex, 1)}
                        className="text-gray-400 hover:text-gray-700 disabled:opacity-30"
                        title="Move down"
                      >
                        <ChevronDownIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {editingStageIndex === stageIndex ? (
                    <div className="flex-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editingStageName}
                        onChange={(e) => setEditingStageName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleRenameStage(stageIndex)}
                        className="flex-1 px-3 py-1.5 text-sm rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                        autoFocus
                      />
                      <button
                        onClick={() => handleRenameStage(stageIndex)}
                        className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                        title="Save"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { setEditingStageIndex(null); setEditingStageName(""); }}
                        className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 transition-colors"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 flex items-center gap-2.5 min-w-0">
                        {/* Position reads as an ordinal on the left rather than
                            a "Stage N" pill trailing the name — the order is
                            the point, so it leads. */}
                        <span className="flex-shrink-0 text-[11px] font-semibold tabular-nums text-[#99A0AE]">
                          {String(stageIndex + 1).padStart(2, "0")}
                        </span>
                        <span className="text-sm font-semibold text-gray-900 truncate">{stage.name}</span>
                      </div>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {!embedded ? (
                          <>
                            <button
                              type="button"
                              onClick={() => { setEditingStageIndex(stageIndex); setEditingStageName(stage.name); }}
                              className="flex items-center justify-center w-7 h-7 rounded-full text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Rename stage"
                            >
                              <EditIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteStage(stageIndex)}
                              className="flex items-center justify-center w-7 h-7 rounded-full text-red-600 hover:bg-red-50 transition-colors"
                              title="Delete stage"
                            >
                              <DeleteIcon className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <ChevronDownIcon 
                            className={`w-4 h-4 text-gray-400 transition-transform ${expandedStageIndex === stageIndex ? 'rotate-180' : ''}`} 
                          />
                        )}
                      </div>
                    </>
                  )}
                </div>

                {(!embedded || expandedStageIndex === stageIndex) && (
                  <div className="px-4 py-3.5 border-t border-[#F1F1F5] bg-white">
                    <div className="mb-3 border-b border-[#E1E4EA] pb-2">
                      <h3 className="text-[11px] font-bold text-gray-500 tracking-wider uppercase">Statuses</h3>
                    </div>
                    {/* Each status is its own card row, matching the Pipeline
                        Stages drawer: dot, name, and a delete button that's
                        always visible rather than hover-only. */}
                    <div className="space-y-2 mb-3">
                    {stage.statuses.map((status, statusIndex) => (
                      <div
                        key={status}
                        className="bg-white border border-[#E1E4EA] hover:border-blue-300 rounded-lg px-3 h-11 flex items-center justify-between gap-3 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                          <span className="text-[14px] font-medium text-[#1F2937] truncate">{status}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteStatus(stageIndex, statusIndex)}
                          disabled={saving}
                          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-[#99A0AE] hover:text-[#DF120B] hover:bg-red-50 disabled:opacity-40 transition-colors"
                          title="Remove status"
                        >
                          <DeleteIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <form
                    onSubmit={(e) => { e.preventDefault(); handleAddStatus(stageIndex); }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={newStatusInputs[stageIndex] || ""}
                      onChange={(e) => setNewStatusInputs((prev) => ({ ...prev, [stageIndex]: e.target.value }))}
                      placeholder="Add status"
                      disabled={saving}
                      className="flex-1 min-w-0 px-3.5 h-9 text-[13px] rounded-full border border-[#E1E4EA] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    />
                    <button
                      type="submit"
                      disabled={saving || !(newStatusInputs[stageIndex] || "").trim()}
                      className="flex-shrink-0 px-3.5 h-9 bg-[#F5F7FA] hover:bg-[#E1E4EA] text-[#525866] text-[12px] font-semibold rounded-full disabled:opacity-50 transition-colors flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Status
                    </button>
                  </form>
                </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!embedded && (
          <p className="text-xs text-gray-400 mt-3">
            A stage or status still assigned to a contact can't be removed — reassign those contacts first.
            Changes save automatically and apply to every contact page, dropdown and the Kanban board.
          </p>
        )}
      </div>
    </div>
  );
}
