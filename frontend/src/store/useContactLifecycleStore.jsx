// src/store/useContactLifecycleStore.js
//
// Single source of truth for the contact lifecycle (stage -> statuses),
// fetched from /contact-lifecycle-settings (backend: ContactLifecycleSettings,
// per organization). Every surface that used to import the hardcoded map from
// utils/contactConstants.js — the lifecycle edit modal, the status dropdown on
// the contacts table, the Kanban board, CompanyContactsTab's status badges —
// reads through this store instead, so a stage added in Settings shows up
// everywhere with no further change and nothing keeps its own copy.
//
// utils/contactConstants.js still exists (colors, and the default shape used
// before this store has loaded/before an organization has ever saved custom
// settings), it just isn't the source of stage/status data anymore.
import { create } from "zustand";
import API from "../services/api";
import { lifecycleStageOptions as DEFAULT_OPTIONS } from "../utils/contactConstants";

const defaultStages = Object.entries(DEFAULT_OPTIONS).map(([name, statuses]) => ({
  name,
  statuses: [...statuses],
}));

const buildDerived = (stages) => {
  const lifecycleStageOptions = {};
  stages.forEach((s) => {
    lifecycleStageOptions[s.name] = s.statuses;
  });
  return {
    lifecycleStageOptions,
    allLifecycleStages: stages.map((s) => s.name),
    allStageStatuses: stages.flatMap((s) => s.statuses),
  };
};

const useContactLifecycleStore = create((set, get) => ({
  stages: defaultStages,
  settingsId: null,
  loaded: false,
  loading: false,
  ...buildDerived(defaultStages),

  fetchStages: async (force = false) => {
    if (get().loading || (get().loaded && !force)) return;
    set({ loading: true });
    try {
      const res = await API.get("/contact-lifecycle-settings");
      const stages = res.data?.stages?.length ? res.data.stages : defaultStages;
      set({
        stages,
        settingsId: res.data?._id || null,
        loaded: true,
        loading: false,
        ...buildDerived(stages),
      });
    } catch (err) {
      console.error("Failed to load contact lifecycle settings", err);
      set({ loaded: true, loading: false });
    }
  },

  // Called by the settings drawer right after a successful save, so every
  // other open surface (dropdowns, Kanban columns) picks up the change
  // immediately instead of waiting for a refetch.
  setStages: (stages, settingsId) =>
    set({ stages, settingsId: settingsId ?? get().settingsId, ...buildDerived(stages) }),

  getLifecycleStageForStatus: (status) => {
    const { stages } = get();
    return stages.find((s) => s.statuses.includes(status))?.name || stages[0]?.name || "Lead";
  },

  defaultStatusForStage: (stageName) => {
    const found = get().stages.find((s) => s.name === stageName);
    return found?.statuses?.[0] || "New";
  },
}));

export default useContactLifecycleStore;
