// GST state codes ("Maharashtra" -> "27"), from the same table the backend's
// utils/stateCodeMap.js uses (shared/gstStateCodes.json), so a code filled in on a
// form always matches what e-invoicing later resolves for that state.
import STATE_CODE_MAP from "../../../shared/gstStateCodes.json";

export function getStateCode(stateInput) {
  if (!stateInput) return null;
  const trimmed = String(stateInput).trim();
  if (/^\d{2}$/.test(trimmed)) return trimmed;
  return STATE_CODE_MAP[trimmed.toLowerCase()] || null;
}

// India Post's pincode API spells some states differently from the state lists the forms'
// dropdowns use ("Chattisgarh" vs "Chhattisgarh", "Pondicherry" vs "Puducherry"). Both spellings
// resolve to the same GST code, so match on the code to pick the dropdown's own spelling;
// falls back to the input unchanged when nothing matches.
export function canonicalStateName(stateInput, stateNames = []) {
  const code = getStateCode(stateInput);
  if (!code) return stateInput;
  return stateNames.find((name) => getStateCode(name) === code) || stateInput;
}
