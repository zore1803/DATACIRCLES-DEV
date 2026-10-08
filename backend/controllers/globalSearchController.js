const { buildFuzzySearchPattern } = require('../utils/searchRegex');
const Company = require("../models/Company");
const Contact = require("../models/Contact");
const Deal = require("../models/Deal");
const Vendor = require("../models/Vendor");
const Note = require("../models/Note");
const Invoice = require("../models/Invoice");
const { cacheGetOrSet } = require("../cacheHelper");
const { globalSearchKey } = require("../utils/cacheKeys");

exports.globalSearch = async (req, res) => {
  try {
    const { search, lifecycleStage, stageStatus } = req.query;
    const orgId = req.user.organization;
    // Versioned, URI-encoded key built in utils/cacheKeys.js (shared with the other caches).
    const cacheKey = globalSearchKey({ org: orgId, search, lifecycleStage, stageStatus });

    const data = await cacheGetOrSet(cacheKey, 60, async () => {
      // Build queries for each collection
      const companyQuery = { organization: orgId };
      if (search) {
        companyQuery.$or = [
          { name: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { industry: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { gstin: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { website: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { address: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { "additionalFields.value": { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        ];
      }

      const contactQuery = { organization: orgId };
      if (search) {
        contactQuery.$or = [
          { name: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { email: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { phone: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { "additionalFields.value": { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        ];
      }
      if (lifecycleStage) contactQuery.lifecycleStage = lifecycleStage;
      if (stageStatus) contactQuery.stageStatus = stageStatus;

      const dealQuery = { organization: orgId };
      if (search) {
        dealQuery.$or = [
          { title: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { status: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { "additionalFields.value": { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        ];
      }

      const vendorQuery = { organization: orgId };
      if (search) {
        vendorQuery.$or = [
          { name: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { email: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { phone: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { company: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { gstin: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { "additionalFields.value": { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        ];
      }

      // Notes match on their title and body text, plus the note type, so
      // searching e.g. "call summary" finds notes filed under that type.
      const noteQuery = { organization: orgId };
      if (search) {
        noteQuery.$or = [
          { title: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { note: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { noteType: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        ];
      }

      // Tax invoices only — pro formas, quotations and delivery challans are
      // separate collections and separate Accounting tabs; folding them into
      // one "Invoices" row would make the count mean something the user can't
      // act on from a single "View all".
      const invoiceQuery = { organization: orgId };
      if (search) {
        invoiceQuery.$or = [
          { invoiceNumber: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { status: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { receiverGSTIN: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { "items.name": { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        ];
      }

      // Run all queries in parallel
      const [companies, contacts, deals, vendors, notes, invoices] =
        await Promise.all([
          Company.find(companyQuery),
          Contact.find(contactQuery).populate("company"),
          Deal.find(dealQuery)
            .populate("company")
            .populate("contact")
            // Only what a result row can show — never the full User document, which
            // carries the password hash and reset token (and this response is cached).
            .populate("user", "name email"),
          Vendor.find(vendorQuery),
          // Notes carry no display name of their own beyond title/body, so the
          // company comes along to label the row in the search panel.
          Note.find(noteQuery).populate("company", "name"),
          Invoice.find(invoiceQuery).select(
            "invoiceNumber status amount date deal organization createdAt updatedAt"
          ),
        ]);

      return { companies, contacts, deals, vendors, notes, invoices };
    });

    res.json(data);
  } catch (error) {
    console.error("Global search error:", error);
    res.status(500).json({ message: "Search failed", error: error.message });
  }
};
