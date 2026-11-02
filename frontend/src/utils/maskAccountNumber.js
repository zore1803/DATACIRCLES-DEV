// Shows only the last four characters of a bank account number; the rest are
// replaced with X so the full number never appears on screen or in exports.
export const maskAccountNumber = (num = "") => {
  const value = String(num ?? "");
  if (value.length <= 4) return value;
  return `${"X".repeat(value.length - 4)}${value.slice(-4)}`;
};
