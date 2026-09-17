import { useEffect, useState } from "react";

// country-state-city's city.json is ~7.7MB — the entire worldwide city
// dataset — versus ~544KB for state.json and under 100KB for country.json.
// A plain `import { City } from "country-state-city"` pulls all of it into
// whatever chunk contains that import, which doubled the app's main bundle
// for a dataset only the Company/Vendor create forms need. Loaded here as
// its own chunk on demand instead, fetched once and cached (shared by every
// caller, so opening both forms in one session doesn't fetch it twice).
let cityModulePromise = null;
export const loadCityModule = () => {
  if (!cityModulePromise) {
    cityModulePromise = import("country-state-city").then((m) => m.City);
  }
  return cityModulePromise;
};

// Component-facing version: null until the chunk resolves, then the real
// City namespace, triggering a re-render so a dropdown reading it via this
// hook shows results once the fetch completes.
export const useLazyCity = () => {
  const [City, setCity] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadCityModule().then((mod) => {
      if (!cancelled) setCity(mod);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return City;
};
