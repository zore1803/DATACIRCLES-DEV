// Offline GSTIN check so bad numbers never hit the API. Each rule reports its
// own message, in this order:
//   1. exactly 15 characters
//   2. first two characters: a valid GST state / territory code
//   3. characters 3-12: the holder's PAN format (5 letters, 4 digits, 1 letter)
//   4. character 13: alphanumeric (entity number: 1-9, then A-Z)
//   5. character 14: "Z"
//   6. character 15: alphanumeric and equal to the checksum of the first 14
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
export const gstinError = (raw) => {
  const gstin = String(raw || "").trim().toUpperCase();
  if (!gstin) return "Please enter GSTIN number first";

  // 1. Length
  if (gstin.length !== 15) return `GSTIN must be exactly 15 characters (got ${gstin.length})`;
  if (!/^[0-9A-Z]+$/.test(gstin)) return "GSTIN can contain only letters and digits";

  // 2. State / territory code
  const state = Number(gstin.slice(0, 2));
  if (!/^[0-9]{2}$/.test(gstin.slice(0, 2)) || !((state >= 1 && state <= 38) || state === 97 || state === 99)) {
    return "Invalid GSTIN: the first two characters must be a valid GST state code";
  }

  // 3. PAN (characters 3-12)
  const pan = gstin.slice(2, 12);
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
    return "Invalid GSTIN: characters 3 to 12 must be a valid PAN (e.g. ABCDE1234F)";
  }

  // 4. Entity number
  if (!/^[1-9A-Z]$/.test(gstin[12])) {
    return "Invalid GSTIN: the 13th character must be a letter or a digit from 1 to 9";
  }

  // 5. Fixed "Z"
  if (gstin[13] !== "Z") return "Invalid GSTIN: the 14th character must be Z";

  // 6. Checksum
  if (checkDigit(gstin.slice(0, 14)) !== gstin[14]) {
    return "Invalid GSTIN: the last character does not match the checksum";
  }
  return "";
};
