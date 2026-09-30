const axios = require("axios");
const { gstinError } = require("../utils/gstinValidation");

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PROVIDER_URL = "https://gstinapi.in/v1/gstin";

// Successful lookups are reused for a while so repeat fetches cost no provider credit.
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

class GstinError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

const clean = (v) => (typeof v === "string" ? v.trim() : "");

// Provider gives one combined address string; split it into two form lines.
const splitAddress = (full) => {
  const parts = clean(full).split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 2) return { line1: parts.join(", "), line2: "" };
  return { line1: parts.slice(0, 2).join(", "), line2: parts.slice(2).join(", ") };
};

// Provider-specific parsing lives only here.
const normalize = (gstin, d) => {
  const details = d.address_details || {};
  const { line1, line2 } = splitAddress(d.address);
  return {
    gstin: clean(d.gstin) || gstin,
    legalName: clean(d.legal_name),
    tradeName: clean(d.trade_name),
    status: clean(d.status),
    taxpayerType: clean(d.taxpayer_type),
    registrationDate: d.registration_date || "",
    constitution: clean(d.business_constitution),
    principalPlaceOfBusiness: clean(d.address),
    address: {
      line1,
      line2,
      city: clean(details.district) || clean(details.city) || clean(d.city),
      state: clean(details.state),
      stateCode: clean(d.state_code) || gstin.slice(0, 2),
      pincode: clean(d.pincode) || clean(details.pincode),
      country: "India",
    },
  };
};

const PROVIDER_ERRORS = {
  400: [400, "Invalid GSTIN format"],
  401: [502, "GST lookup service is not configured correctly"],
  402: [502, "GST lookup service is unavailable (quota exhausted)"],
  403: [502, "GST lookup service is unavailable"],
  404: [404, "GSTIN not found in the GST database"],
  429: [429, "Too many GST lookups. Please try again in a minute"],
  502: [502, "GST portal is temporarily unavailable. Please try again"],
};

const verifyGstin = async (rawGstin) => {
  const gstin = clean(rawGstin).toUpperCase();
  if (!gstin) throw new GstinError("GSTIN is required", 400);
  const invalid = gstinError(gstin);
  if (invalid) throw new GstinError(invalid, 400);

  const hit = cache.get(gstin);
  if (hit && hit.expires > Date.now()) {
    console.log(`[GSTIN] cache hit, provider not called: ${gstin}`);
    return hit.value;
  }

  console.log(`[GSTIN] 1. format ok: ${gstin}`);
  const apiKey = process.env.GSTIN_API_KEY;
  console.log(`[GSTIN] 2. GSTIN_API_KEY configured: ${!!apiKey}`);
  if (!apiKey) throw new GstinError("GSTIN lookup is not configured", 500);

  let res;
  try {
    res = await axios.get(`${PROVIDER_URL}/${gstin}`, {
      headers: { "x-api-key": apiKey },
      timeout: 15000,
      validateStatus: () => true,
    });
  } catch (err) {
    // Message only — the axios error object carries the request headers (with the key).
    const timedOut = err.code === "ECONNABORTED";
    console.log(`[GSTIN] 3. provider request FAILED (${err.code || "network"})`);
    throw new GstinError(
      timedOut ? "GST lookup timed out. Please try again" : "Could not reach the GST lookup service",
      504
    );
  }

  console.log(`[GSTIN] 3. provider responded: HTTP ${res.status}`);
  if (res.status !== 200 || !res.data?.success) {
    console.log(`[GSTIN] 3a. provider error: ${res.data?.error}`);
    const [status, message] = PROVIDER_ERRORS[res.status] || [502, "GST lookup failed"];
    throw new GstinError(message, status);
  }

  const data = res.data.data;
  if (!data || typeof data !== "object") {
    throw new GstinError("Unexpected response from GST lookup service", 502);
  }

  const result = normalize(gstin, data);
  console.log(`[GSTIN] 4. normalized ok: ${result.legalName} | state=${result.address.state || result.address.stateCode} | pincode=${result.address.pincode}`);
  cache.set(gstin, { value: result, expires: Date.now() + CACHE_TTL_MS });
  return result;
};

module.exports = { verifyGstin, GstinError, GSTIN_REGEX };
