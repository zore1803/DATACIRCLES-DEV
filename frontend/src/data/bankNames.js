// Banks suggested while typing a bank name. Spellings are chosen so that
// getBankLogoUrl() (data/bankLogos.js) resolves a logo for each one.
export const BANK_NAMES = [
  "State Bank of India",
  "HDFC Bank",
  "ICICI Bank",
  "Axis Bank",
  "Kotak Mahindra Bank",
  "Punjab National Bank",
  "Bank of Baroda",
  "Canara Bank",
  "Union Bank of India",
  "Bank of India",
  "Indian Bank",
  "Central Bank of India",
  "Indian Overseas Bank",
  "UCO Bank",
  "Bank of Maharashtra",
  "Punjab & Sind Bank",
  "IDBI Bank",
  "Yes Bank",
  "IndusInd Bank",
  "IDFC First Bank",
  "Federal Bank",
  "RBL Bank",
  "South Indian Bank",
  "Karur Vysya Bank",
  "City Union Bank",
  "Bandhan Bank",
  "AU Small Finance Bank",
  "Equitas Small Finance Bank",
  "Ujjivan Small Finance Bank",
  "Jammu & Kashmir Bank",
  "Karnataka Bank",
  "Dhanlaxmi Bank",
  "Tamilnad Mercantile Bank",
  "Standard Chartered Bank",
  "HSBC",
  "Citibank",
  "Deutsche Bank",
  "DBS Bank",
  "Bank of America",
  "American Express",
  "Paytm Payments Bank",
  "Airtel Payments Bank",
  "India Post Payments Bank",
];

// Case-insensitive match on any word start, best (prefix) matches first.
export function suggestBanks(query, limit = 8) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const starts = [];
  const contains = [];
  for (const name of BANK_NAMES) {
    const n = name.toLowerCase();
    if (n === q) continue;
    if (n.startsWith(q)) starts.push(name);
    else if (n.split(/[\s&]+/).some((w) => w.startsWith(q)) || n.includes(q)) contains.push(name);
  }
  return [...starts, ...contains].slice(0, limit);
}
