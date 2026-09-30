// Offline GSTIN check (format, state code, check digit) so bad numbers never hit the API.
const FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const checkDigit = (first14) => {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
};

// Returns an error message, or "" when the GSTIN is valid.
const gstinError = (raw) => {
  const gstin = String(raw || "").trim().toUpperCase();
  if (!gstin) return "Please enter GSTIN number first";
  if (gstin.length !== 15 || !FORMAT.test(gstin)) return "Invalid GSTIN format. Please check the number";
  const state = Number(gstin.slice(0, 2));
  if (!((state >= 1 && state <= 38) || state === 97 || state === 99)) return "Invalid GSTIN: unknown state code";
  if (checkDigit(gstin.slice(0, 14)) !== gstin[14]) return "Invalid GSTIN: check digit does not match";
  return "";
};

module.exports = { gstinError };
