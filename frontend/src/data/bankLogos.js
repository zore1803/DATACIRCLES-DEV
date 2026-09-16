// src/data/bankLogos.js
/**
 * Helper that returns the public URL for a bank logo stored in the
 * `public/bank-icons` folder. Assets placed in `public` are served directly
 * from the site root, so we can reference them via static URLs.
 *
 * This file maintains a **static map** of known banks to their relative URL
 * inside `public/bank-icons`. An alias map handles common name variations
 * (e.g., "HDFC" vs "HDFC Bank"). Adding a new logo only requires an entry
 * in `logoMap`.
 *
 * `logoMap` below is generated straight from every file already sitting in
 * `public/bank-icons` (find + sed, not retyped by hand) — the asset set was
 * far more complete than what this file used to register (6 banks out of
 * 140+ files on disk), so most saved bank names were silently falling back
 * to the initials avatar despite an actual logo already being available.
 */

// Normalise a string: trim spaces, remove non‑alphanumeric chars, lower‑case.
function normalise(str) {
  return String(str)
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

// Alias map – maps a normalised variation to the canonical key used in `logoMap`.
// Only needed where the commonly-typed/IFSC-returned bank name doesn't already
// normalise straight to its filename slug (most public/private sector banks do).
const aliasMap = {
  // HDFC variations
  hdfc: "hdfcbank",
  // State Bank of India
  sbiindia: "sbi",
  statebankofindia: "sbi",
  // ICICI Bank
  icici: "icicibank",
  // Axis Bank
  axis: "axisbank",
  // Kotak Mahindra Bank – file is bi_kotak.png
  kotakbank: "kotak",
  kotakmahindra: "kotak",
  kotakmahindrabank: "kotak",
  // Punjab National Bank – file is bi_pnbindia.png
  pnb: "pnbindia",
  punjabnationalbank: "pnbindia",
  punjabnational: "pnbindia",
  // Union Bank of India – file is bi_unionbankonline.png
  unionbank: "unionbankonline",
  unionbankofindia: "unionbankonline",
  // Punjab & Sind Bank – file has "and" spelled out
  punjabsindbank: "punjabandsindbank",
  punjabsindhbank: "punjabandsindbank",
  // IDBI Bank
  idbibank: "idbi",
  // Standard Chartered – file is bi_sc.png
  standardchartered: "sc",
  standardcharteredbank: "sc",
  // Bank of America
  bankofamerica: "bofa-india",
  bofa: "bofa-india",
  // Credit Agricole CIB
  creditagricole: "ca-cib",
  creditagricolecib: "ca-cib",
  // Sonali Bank
  sonalibankltd: "sonalibank",
  // AU Small Finance Bank
  ausmallfinancebank: "aubank",
  // Equitas Small Finance Bank
  equitassmallfinancebank: "equitasbank",
  // ESAF Small Finance Bank
  esafsmallfinancebank: "esafbank",
  // Fincare Small Finance Bank
  fincaresmallfinancebank: "fincarebank",
  // Jana Small Finance Bank
  janasmallfinancebank: "janabank",
  // Suryoday Small Finance Bank
  suryodaysmallfinancebank: "suryodaybank",
  // Ujjivan Small Finance Bank
  ujjivansmallfinancebank: "ujjivansfb",
  // Utkarsh Small Finance Bank
  utkarshsmallfinancebank: "utkarsh",
  // Unity Small Finance Bank
  unitysmallfinancebank: "theunitybank",
  // India Post Payments Bank
  indiapostpaymentsbank: "ippbonline",
  // Airtel Payments Bank
  airtelpaymentsbank: "airtel",
  // Paytm Payments Bank
  paytmpaymentsbank: "paytmbank",
  // Jio Payments Bank
  jiopaymentsbankltd: "jiopaymentsbank",
  // Fino Payments Bank
  finopaymentsbank: "finobank",
  // NSDL Payments Bank
  nsdlpaymentsbank: "nsdlbank",
};

// Static map of canonical keys to their public URLs (relative to the site
// root), generated from every asset under public/bank-icons.
const logoMap = {
  "1qbank": "/bank-icons/foreign_banks/bi_1qbank.png",
  abbl: "/bank-icons/foreign_banks/bi_abbl.png",
  agvbank: "/bank-icons/regional_rural_banks/bi_agvbank.png",
  airtel: "/bank-icons/payments_banks/bi_airtel.png",
  americanexpress: "/bank-icons/foreign_banks/bi_americanexpress.png",
  anz: "/bank-icons/foreign_banks/bi_anz.png",
  apgb: "/bank-icons/regional_rural_banks/bi_apgb.png",
  apgvbank: "/bank-icons/regional_rural_banks/bi_apgvbank.png",
  apruralbank: "/bank-icons/regional_rural_banks/bi_apruralbank.png",
  "aryavart-rrb": "/bank-icons/regional_rural_banks/bi_aryavart-rrb.png",
  aubank: "/bank-icons/small_finance_banks/bi_aubank.png",
  axisbank: "/bank-icons/private_sector_banks/bi_axisbank.png",
  bandhanbank: "/bank-icons/private_sector_banks/bi_bandhanbank.png",
  bankfab: "/bank-icons/foreign_banks/bi_bankfab.png",
  bankofbaroda: "/bank-icons/public_sector_banks/bi_bankofbaroda.png",
  bankofceylon: "/bank-icons/foreign_banks/bi_bankofceylon.png",
  bankofchina: "/bank-icons/foreign_banks/bi_bankofchina.png",
  bankofindia: "/bank-icons/public_sector_banks/bi_bankofindia.png",
  bankofmaharashtra: "/bank-icons/public_sector_banks/bi_bankofmaharashtra.png",
  barclays: "/bank-icons/foreign_banks/bi_barclays.png",
  barodaupbank: "/bank-icons/regional_rural_banks/bi_barodaupbank.png",
  bbkindia: "/bank-icons/foreign_banks/bi_bbkindia.png",
  bggb: "/bank-icons/regional_rural_banks/bi_bggb.png",
  bgvb: "/bank-icons/regional_rural_banks/bi_bgvb.png",
  bnpparibas: "/bank-icons/foreign_banks/bi_bnpparibas.png",
  "bofa-india": "/bank-icons/foreign_banks/bi_bofa-india.png",
  brkgb: "/bank-icons/regional_rural_banks/bi_brkgb.png",
  "ca-cib": "/bank-icons/foreign_banks/bi_ca-cib.png",
  canarabank: "/bank-icons/public_sector_banks/bi_canarabank.png",
  capitalbank: "/bank-icons/small_finance_banks/bi_capitalbank.png",
  centralbankofindia: "/bank-icons/public_sector_banks/bi_centralbankofindia.png",
  cgbank: "/bank-icons/regional_rural_banks/bi_cgbank.png",
  cggb: "/bank-icons/regional_rural_banks/bi_cggb.png",
  chinatrustindia: "/bank-icons/foreign_banks/bi_chinatrustindia.png",
  citibank: "/bank-icons/foreign_banks/bi_citibank.png",
  cityunionbank: "/bank-icons/private_sector_banks/bi_cityunionbank.png",
  coastalareabank: "/bank-icons/local_area_banks/bi_coastalareabank.png",
  "credit-suisse": "/bank-icons/foreign_banks/bi_credit-suisse.png",
  csb: "/bank-icons/private_sector_banks/bi_csb.png",
  dbgb: "/bank-icons/regional_rural_banks/bi_dbgb.png",
  dbs: "/bank-icons/foreign_banks/bi_dbs.png",
  dcbbank: "/bank-icons/private_sector_banks/bi_dcbbank.png",
  deutschebank: "/bank-icons/foreign_banks/bi_deutschebank.png",
  dhanbank: "/bank-icons/private_sector_banks/bi_dhanbank.png",
  dohabank: "/bank-icons/foreign_banks/bi_dohabank.png",
  edb: "/bank-icons/regional_rural_banks/bi_edb.png",
  emiratesnbd: "/bank-icons/foreign_banks/bi_emiratesnbd.png",
  equitasbank: "/bank-icons/small_finance_banks/bi_equitasbank.png",
  esafbank: "/bank-icons/small_finance_banks/bi_esafbank.png",
  eximbankindia: "/bank-icons/financial_institutions/bi_eximbankindia.png",
  federalbank: "/bank-icons/private_sector_banks/bi_federalbank.png",
  fincarebank: "/bank-icons/small_finance_banks/bi_fincarebank.png",
  finobank: "/bank-icons/payments_banks/bi_finobank.png",
  firstrand: "/bank-icons/foreign_banks/bi_firstrand.png",
  globalibk: "/bank-icons/foreign_banks/bi_globalibk.png",
  hdfcbank: "/bank-icons/private_sector_banks/bi_hdfcbank.png",
  hpgb: "/bank-icons/regional_rural_banks/bi_hpgb.png",
  hsbc: "/bank-icons/foreign_banks/bi_hsbc.png",
  icbcindia: "/bank-icons/foreign_banks/bi_icbcindia.png",
  icicibank: "/bank-icons/private_sector_banks/bi_icicibank.png",
  idbi: "/bank-icons/private_sector_banks/bi_idbi.png",
  idfcbank: "/bank-icons/private_sector_banks/bi_idfcbank.png",
  indianbank: "/bank-icons/public_sector_banks/bi_indianbank.png",
  indusind: "/bank-icons/private_sector_banks/bi_indusind.png",
  iob: "/bank-icons/public_sector_banks/bi_iob.png",
  ippbonline: "/bank-icons/payments_banks/bi_ippbonline.png",
  janabank: "/bank-icons/small_finance_banks/bi_janabank.png",
  jiopaymentsbank: "/bank-icons/payments_banks/bi_jiopaymentsbank.png",
  jkbank: "/bank-icons/private_sector_banks/bi_jkbank.png",
  jkgb: "/bank-icons/regional_rural_banks/bi_jkgb.png",
  jpmorgan: "/bank-icons/foreign_banks/bi_jpmorgan.png",
  jrgb: "/bank-icons/regional_rural_banks/bi_jrgb.png",
  karnatakabank: "/bank-icons/private_sector_banks/bi_karnatakabank.png",
  karnatakagraminbank: "/bank-icons/regional_rural_banks/bi_karnatakagraminbank.png",
  kbfg: "/bank-icons/foreign_banks/bi_kbfg.png",
  kbsbankindia: "/bank-icons/local_area_banks/bi_kbsbankindia.png",
  keralagbank: "/bank-icons/regional_rural_banks/bi_keralagbank.png",
  kotak: "/bank-icons/private_sector_banks/bi_kotak.png",
  krungthai: "/bank-icons/foreign_banks/bi_krungthai.png",
  kvb: "/bank-icons/private_sector_banks/bi_kvb.png",
  kvgbank: "/bank-icons/regional_rural_banks/bi_kvgbank.png",
  mahagramin: "/bank-icons/regional_rural_banks/bi_mahagramin.png",
  manipurruralbank: "/bank-icons/regional_rural_banks/bi_manipurruralbank.png",
  mashreqbank: "/bank-icons/foreign_banks/bi_mashreqbank.png",
  maybank: "/bank-icons/foreign_banks/bi_maybank.png",
  meghalayaruralbank: "/bank-icons/regional_rural_banks/bi_meghalayaruralbank.png",
  mgbank: "/bank-icons/regional_rural_banks/bi_mgbank.png",
  mizoramruralbank: "/bank-icons/regional_rural_banks/bi_mizoramruralbank.png",
  mizuhobank: "/bank-icons/foreign_banks/bi_mizuhobank.png",
  mpgb: "/bank-icons/regional_rural_banks/bi_mpgb.png",
  mufg: "/bank-icons/foreign_banks/bi_mufg.png",
  nabard: "/bank-icons/financial_institutions/bi_nabard.png",
  nagalandruralbank: "/bank-icons/regional_rural_banks/bi_nagalandruralbank.png",
  nainitalbank: "/bank-icons/private_sector_banks/bi_nainitalbank.png",
  natwestmarkets: "/bank-icons/foreign_banks/bi_natwestmarkets.png",
  nesfb: "/bank-icons/small_finance_banks/bi_nesfb.png",
  nhb: "/bank-icons/financial_institutions/bi_nhb.png",
  nsdlbank: "/bank-icons/payments_banks/bi_nsdlbank.png",
  odishabank: "/bank-icons/regional_rural_banks/bi_odishabank.png",
  paytmbank: "/bank-icons/payments_banks/bi_paytmbank.png",
  pbgbank: "/bank-icons/regional_rural_banks/bi_pbgbank.png",
  pgb: "/bank-icons/regional_rural_banks/bi_pgb.png",
  pnbindia: "/bank-icons/public_sector_banks/bi_pnbindia.png",
  prathamaupbank: "/bank-icons/regional_rural_banks/bi_prathamaupbank.png",
  puduvaibharathiargramabank: "/bank-icons/regional_rural_banks/bi_puduvaibharathiargramabank.png",
  punjabandsindbank: "/bank-icons/public_sector_banks/bi_punjabandsindbank.png",
  qnb: "/bank-icons/foreign_banks/bi_qnb.png",
  rabobank: "/bank-icons/foreign_banks/bi_rabobank.png",
  rblbank: "/bank-icons/private_sector_banks/bi_rblbank.png",
  rmgb: "/bank-icons/regional_rural_banks/bi_rmgb.png",
  saptagirigrameenabank: "/bank-icons/regional_rural_banks/bi_saptagirigrameenabank.png",
  sberbank: "/bank-icons/foreign_banks/bi_sberbank.png",
  sbi: "/bank-icons/public_sector_banks/bi_sbi.png",
  sbmbank: "/bank-icons/foreign_banks/bi_sbmbank.png",
  sc: "/bank-icons/foreign_banks/bi_sc.png",
  scotiabank: "/bank-icons/foreign_banks/bi_scotiabank.png",
  sgbrrb: "/bank-icons/regional_rural_banks/bi_sgbrrb.png",
  shgb: "/bank-icons/regional_rural_banks/bi_shgb.png",
  shinhanglobal: "/bank-icons/foreign_banks/bi_shinhanglobal.png",
  shivalikbank: "/bank-icons/small_finance_banks/bi_shivalikbank.png",
  sidbi: "/bank-icons/financial_institutions/bi_sidbi.png",
  smbc: "/bank-icons/foreign_banks/bi_smbc.png",
  societegenerale: "/bank-icons/foreign_banks/bi_societegenerale.png",
  sonalibank: "/bank-icons/foreign_banks/bi_sonalibank.png",
  southindianbank: "/bank-icons/private_sector_banks/bi_southindianbank.png",
  suryodaybank: "/bank-icons/small_finance_banks/bi_suryodaybank.png",
  tamilnadugramabank: "/bank-icons/regional_rural_banks/bi_tamilnadugramabank.png",
  tgbhyd: "/bank-icons/regional_rural_banks/bi_tgbhyd.png",
  theunitybank: "/bank-icons/small_finance_banks/bi_theunitybank.png",
  tmb: "/bank-icons/private_sector_banks/bi_tmb.png",
  tripuragraminbank: "/bank-icons/regional_rural_banks/bi_tripuragraminbank.png",
  ubgb: "/bank-icons/regional_rural_banks/bi_ubgb.png",
  ubkgb: "/bank-icons/regional_rural_banks/bi_ubkgb.png",
  ucobank: "/bank-icons/public_sector_banks/bi_ucobank.png",
  ujjivansfb: "/bank-icons/small_finance_banks/bi_ujjivansfb.png",
  unionbankonline: "/bank-icons/public_sector_banks/bi_unionbankonline.png",
  uobgroup: "/bank-icons/foreign_banks/bi_uobgroup.png",
  utkalgrameenbank: "/bank-icons/regional_rural_banks/bi_utkalgrameenbank.png",
  utkarsh: "/bank-icons/small_finance_banks/bi_utkarsh.png",
  uttarakhandgraminbank: "/bank-icons/regional_rural_banks/bi_uttarakhandgraminbank.png",
  vkgb: "/bank-icons/regional_rural_banks/bi_vkgb.png",
  vtbindia: "/bank-icons/foreign_banks/bi_vtbindia.png",
  wooribank: "/bank-icons/foreign_banks/bi_wooribank.png",
  yesbank: "/bank-icons/private_sector_banks/bi_yesbank.png",
};

/**
 * Returns the public URL for a bank logo, or `null` if no logo is defined.
 * @param {string} bankName Full bank name (e.g. "HDFC Bank")
 * @returns {string|null}
 */
export function getBankLogoUrl(bankName) {
  if (!bankName) return null;
  const normalized = normalise(bankName);
  const canonical = aliasMap[normalized] || normalized;
  return logoMap[canonical] || null;
}
