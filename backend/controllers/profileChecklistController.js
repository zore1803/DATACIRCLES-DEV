const Organization = require("../models/Organization");
const Branding = require("../models/Branding");
const BankDetails = require("../models/BankDetails");

// Signup provisions "<Full Name>'s Workspace" when the company step is skipped; that
// placeholder means the real company name hasn't been given yet.
const PLACEHOLDER_NAME = /'s workspace$/i;
const filled = (value) => typeof value === "string" && value.trim().length > 0;
const realName = (value) => filled(value) && !PLACEHOLDER_NAME.test(value.trim());

/**
 * GET /api/profile-checklist
 *
 * Profile / company completeness for the admin who runs the workspace: which of the
 * details asked for at signup and login are still missing. Computed from the live
 * records on every call, so nothing can drift out of sync. Company details live in
 * two places (the signup form writes the Organization; Settings > Organization
 * Details writes Branding), so a field counts as filled if either has it.
 *
 * Only admins get a checklist: staff can't edit company details or banks.
 */
exports.getProfileChecklist = async (req, res) => {
  try {
    const user = req.user;
    if (!user || user.role !== "admin" || !user.organization) {
      return res.json({ applicable: false });
    }

    const [org, branding, bankCount] = await Promise.all([
      Organization.findById(user.organization).select("name address state gstNumber").lean(),
      Branding.findOne({ organization: user.organization })
        .sort({ updatedAt: -1 })
        .select("companyName address state gstin")
        .lean(),
      BankDetails.countDocuments({ organization: user.organization }),
    ]);

    // isEmailVerified / isPhoneVerified default to true and only flip to false for a
    // value that was entered but not confirmed, so the value must exist as well.
    const hasEmail = (filled(user.email) && user.isEmailVerified !== false) || filled(user.profileEmail);
    const hasPhone = filled(user.phone) && user.isPhoneVerified !== false;

    const items = [
      { key: "name", label: "Full name", done: filled(user.name) && user.name.trim() !== "Unknown", link: "/profile" },
      { key: "email", label: "Verified email", done: hasEmail, link: "/profile" },
      { key: "phone", label: "Verified phone number", done: hasPhone, link: "/profile" },
      {
        key: "companyName",
        label: "Company name",
        done: realName(branding?.companyName) || realName(org?.name),
        link: "/settings/brand",
      },
      {
        key: "address",
        label: "Company address",
        done: filled(branding?.address) || filled(org?.address),
        link: "/settings/brand",
      },
      { key: "state", label: "State", done: filled(branding?.state) || filled(org?.state), link: "/settings/brand" },
      {
        key: "gstin",
        label: "GSTIN",
        done: filled(branding?.gstin) || filled(org?.gstNumber),
        link: "/settings/brand",
      },
      { key: "bank", label: "Bank details", done: bankCount > 0, link: "/settings/bank" },
    ];

    const completed = items.filter((item) => item.done).length;
    const total = items.length;
    const percent = Math.round((completed / total) * 100);

    res.json({ applicable: true, items, completed, total, percent });
  } catch (error) {
    console.error("Profile checklist error:", error);
    res.status(500).json({ message: "Unable to load the checklist." });
  }
};
