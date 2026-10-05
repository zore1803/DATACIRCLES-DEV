const Deal = require("../models/Deal");

/**
 * Factory for the Documents-tab rollups on the Company and Contact pages.
 *
 * Sales documents (invoice, quotation, proforma, delivery challan, sales return)
 * link to a Deal — never directly to a company or contact — so to list a
 * company's / contact's documents we first resolve that entity's deals, then
 * find every document whose `deal` is in that set. This mirrors the existing
 * invoiceController.getInvoicesByCompany, just generalised over the document
 * model and the Deal field ("company" | "contact").
 *
 * Everything is scoped to the caller's organization. The handler returns a plain
 * array, matching the shape the deal-scoped and vendor endpoints already return,
 * so the Documents tab can parse every scope the same way.
 *
 * @param {import('mongoose').Model} Model  the sales-document model to query
 * @param {"company"|"contact"} dealField   the Deal field to match the entity on
 * @returns {import('express').RequestHandler}
 */
function listDocsByDealEntity(Model, dealField) {
  // Quotation/Proforma can also be linked DIRECTLY to a company/contact (no deal).
  // Those models carry a `company`/`contact` path; invoice/challan/sales-return
  // do not, so we only add the direct-link branch when the model actually has it.
  const hasDirectLink = !!Model.schema.path(dealField);

  return async (req, res) => {
    try {
      const entityId = req.params[`${dealField}Id`];

      const deals = await Deal.find({
        [dealField]: entityId,
        organization: req.user.organization,
      }).select("_id");
      const dealIds = deals.map((d) => d._id);

      // Union of deal-linked docs and (where supported) directly-linked ones. A
      // document has either a deal or a direct link — never both — so there is no
      // double counting.
      const match = hasDirectLink
        ? { $or: [{ deal: { $in: dealIds } }, { [dealField]: entityId }] }
        : { deal: { $in: dealIds } };

      const docs = await Model.find({
        ...match,
        organization: req.user.organization,
      })
        .populate("deal")
        .sort({ createdAt: -1 });

      res.json(docs);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  };
}

module.exports = { listDocsByDealEntity };
