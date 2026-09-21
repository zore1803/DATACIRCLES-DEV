/**
 * stateCodeMap.js
 *
 * Central lookup utility for Indian GST state codes (2-digit numeric).
 * Used by the E-Invoice mapper to convert a human-readable state name
 * (e.g. "Maharashtra") into the IRP-required numeric code (e.g. "27").
 *
 * Single source of truth — never ask users to type a numeric code manually.
 * Usage:
 *   const { getStateCode } = require('./stateCodeMap');
 *   getStateCode('Maharashtra'); // → "27"
 *   getStateCode('27');          // → "27"  (passthrough if already a code)
 */

// The table lives in shared/gstStateCodes.json so the frontend (e.g. pincode autofill filling a
// form's State Code) resolves codes from the exact same data. Includes India Post's own
// spellings ("Chattisgarh", "Andaman & Nicobar", "Daman & Diu") as aliases.
const STATE_CODE_MAP = require("../../shared/gstStateCodes.json");

/**
 * Returns the 2-digit GST state code for a given state name or code.
 *
 * @param {string} stateInput - State name (e.g. "Maharashtra") or existing numeric code (e.g. "27")
 * @returns {string|null} - 2-digit code string, or null if not found
 */
function getStateCode(stateInput) {
  if (!stateInput) return null;

  const trimmed = stateInput.trim();

  // Passthrough: if it's already a valid 2-digit numeric code, return as-is
  if (/^\d{2}$/.test(trimmed)) return trimmed;

  const lookup = trimmed.toLowerCase();
  return STATE_CODE_MAP[lookup] || null;
}

/**
 * Returns the state name for a given 2-digit GST state code.
 * Useful for display in UI or audit logs.
 *
 * @param {string} code - 2-digit state code (e.g. "27")
 * @returns {string|null}
 */
function getStateName(code) {
  if (!code) return null;
  const entry = Object.entries(STATE_CODE_MAP).find(([, v]) => v === code.trim());
  return entry ? entry[0] : null;
}

module.exports = { getStateCode, getStateName, STATE_CODE_MAP };
