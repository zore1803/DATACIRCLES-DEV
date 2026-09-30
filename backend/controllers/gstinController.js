const { verifyGstin, GstinError } = require("../services/gstinService");

exports.verify = async (req, res) => {
  console.log(`[GSTIN] 0. /verify hit by user ${req.user?._id || req.user?.id || "?"}`);
  try {
    const data = await verifyGstin(req.body?.gstin);
    console.log("[GSTIN] 5. response sent to browser");
    return res.json({ success: true, data });
  } catch (err) {
    if (err instanceof GstinError) {
      console.log(`[GSTIN] FAILED ${err.status}: ${err.message}`);
      return res.status(err.status).json({ success: false, error: err.message });
    }
    console.error("GSTIN verify error:", err.message);
    return res.status(500).json({ success: false, error: "GST lookup failed" });
  }
};
