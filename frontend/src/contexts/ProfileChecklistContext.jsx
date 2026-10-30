import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import API from "../services/api";

// Profile / company completeness of the signed-in admin (GET /profile-checklist). One fetch
// is shared by the top bar and the dashboard card. It refreshes on every route change and when
// the window regains focus, so filling in a missing detail in Settings updates the bar as soon
// as the user navigates back.

// The bar and card are shown only while the profile is under this much complete.
export const CHECKLIST_VISIBLE_BELOW_PERCENT = 90;

const ProfileChecklistContext = createContext({ data: null, visible: false, refresh: () => {} });

export function ProfileChecklistProvider({ enabled, children }) {
  const location = useLocation();
  const [data, setData] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const res = await API.get("/profile-checklist");
      setData(res.data);
    } catch {
      // Keep whatever was last loaded: a failed refresh shouldn't make the bar flicker away.
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }
    refresh();
  }, [enabled, location.pathname, refresh]);

  useEffect(() => {
    if (!enabled) return undefined;
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [enabled, refresh]);

  const value = useMemo(
    () => ({
      data,
      refresh,
      visible: Boolean(data?.applicable && data.percent < CHECKLIST_VISIBLE_BELOW_PERCENT),
    }),
    [data, refresh],
  );

  return <ProfileChecklistContext.Provider value={value}>{children}</ProfileChecklistContext.Provider>;
}

export const useProfileChecklist = () => useContext(ProfileChecklistContext);
