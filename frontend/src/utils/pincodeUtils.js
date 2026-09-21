import { State } from "country-state-city";

let cityModuleCache = null;

const loadCityModule = async () => {
  if (cityModuleCache) return cityModuleCache;
  const module = await import("country-state-city");
  cityModuleCache = module.City;
  return module.City;
};

export const lookupIndianPincode = async (pincode) => {
  if (!/^\d{6}$/.test(pincode)) return null;
  try {
    const [res, City] = await Promise.all([
      fetch(`https://api.postalpincode.in/pincode/${pincode}`),
      loadCityModule(),
    ]);
    const data = await res.json();
    const po = data?.[0]?.Status === "Success" ? data[0].PostOffice?.[0] : null;
    if (!po) return null;

    const countryIso = "IN"; // India — this utility is India-only
    const matchedState = State.getStatesOfCountry(countryIso).find(
      (s) => s.name.toLowerCase() === po.State?.toLowerCase(),
    );
    if (!matchedState) return null;

    const allCities = City.getCitiesOfState(countryIso, matchedState.isoCode);
    const matchedCity = allCities.find(
      (c) => c.name.toLowerCase() === po.District?.toLowerCase(),
    ) || allCities.find(
      (c) => c.name.toLowerCase() === po.Region?.toLowerCase(),
    );

    return {
      country: "India",
      state: matchedState.name,
      city: matchedCity?.name || po.District || po.Region || po.Name,
    };
  } catch (err) {
    console.error("Failed to lookup pincode:", err);
    return null;
  }
};
