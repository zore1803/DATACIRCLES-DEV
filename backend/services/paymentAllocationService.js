// Payment allocation engine. One payment is split across one or more open
// documents; both directions run the same code path, with the per-type
// differences captured in DOC_CONFIG below.
//
// Allocating pushes a subdoc into the target document's own payments[] — the
// array every Paid/Pending figure in the app already reads — and writes a
// PaymentAllocation row holding that subdoc's _id so the push can be undone.

const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Purchase = require("../models/Purchase");
const PurchaseReturn = require("../models/PurchaseReturn");
const SalesReturn = require("../models/SalesReturn");
const Deal = require("../models/Deal");
const Payment = require("../models/Payment");
const PaymentAllocation = require("../models/PaymentAllocation");
// Payment.party is a refPath, so all three must be registered before populate.
// Required here so a script loading only this service doesn't MissingSchemaError.
require("../models/Company");
require("../models/Contact");
require("../models/Vendor");

// Money comparisons use a 1-paisa tolerance throughout, matching the existing
// controllers (`amountDue + 0.01`).
const EPSILON = 0.01;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const sumPayments = (payments) =>
  (payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

// paymentType is a subset of paymentMethod, so it's always valid. Anything
// unrecognised falls back to "Other" instead of failing enum validation.
const VALID_METHODS = new Set([
  "Cash", "UPI", "Net Banking", "Cheque", "Card",
  "NEFT", "RTGS", "IMPS", "EMI", "TDS", "Other",
]);
const toPaymentMethod = (paymentType) =>
  VALID_METHODS.has(paymentType) ? paymentType : "Other";

// Per-document-type differences, so allocate()/reverse() stay direction-blind.
const DOC_CONFIG = {
  Invoice: {
    model: Invoice,
    direction: "IN",
    // Invoice.amount is the document total; Purchase uses grandTotal.
    totalOf: (doc) => Number(doc.amount) || 0,
    numberOf: (doc) => doc.invoiceNumber,
    dateOf: (doc) => doc.date || doc.createdAt,
    // Cancelled is terminal: reversing allocations must never flip it back.
    statusFor: (doc, totalPaid) => {
      if (doc.status === "Cancelled") return doc.status;
      const total = Number(doc.amount) || 0;
      if (totalPaid >= total - EPSILON && total > 0) return "Paid";
      if (totalPaid > 0) return "Partially Paid";
      return "Unpaid";
    },
  },
  Purchase: {
    model: Purchase,
    direction: "OUT",
    totalOf: (doc) => Number(doc.grandTotal || doc.subtotal) || 0,
    numberOf: (doc) => doc.purchaseNumber,
    dateOf: (doc) => doc.purchaseDate || doc.createdAt,
    // Mirrors purchaseController.statusForPaidAmount, including the terminal
    // Cancelled rule and Draft-stays-Draft-at-zero.
    statusFor: (doc, totalPaid) => {
      // Only the payment band is money-driven; other statuses stay put. Kept in
      // step with purchaseController.statusForPaidAmount.
      if (!["Confirmed", "Partial", "Paid"].includes(doc.status)) return doc.status;
      const total = Number(doc.grandTotal) || 0;
      if (totalPaid >= total - EPSILON && total > 0) return "Paid";
      if (totalPaid > 0) return "Partial";
      return "Confirmed";
    },
  },
  // Goods go back to the vendor, so money comes back to us. Refunds can be partial.
  PurchaseReturn: {
    model: PurchaseReturn,
    direction: "IN",
    totalOf: (doc) => Number(doc.grandTotal) || 0,
    numberOf: (doc) => doc.returnNumber,
    dateOf: (doc) => doc.returnDate || doc.createdAt,
    // Only a Confirmed return tracks refunds; other statuses stay put.
    statusFor: (doc, totalRefunded) => {
      if (!["Confirmed", "Partial", "Paid"].includes(doc.status)) return doc.status;
      const total = Number(doc.grandTotal) || 0;
      if (totalRefunded >= total - EPSILON && total > 0) return "Paid";
      if (totalRefunded > 0) return "Partial";
      return "Confirmed";
    },
  },
  // PurchaseReturn inverted: goods come back from the customer, so money goes
  // OUT to them. Refunds can be partial.
  SalesReturn: {
    model: SalesReturn,
    direction: "OUT",
    totalOf: (doc) => Number(doc.grandTotal) || 0,
    numberOf: (doc) => doc.returnNumber,
    dateOf: (doc) => doc.returnDate || doc.createdAt,
    // Only a Confirmed return tracks refunds; other statuses stay put.
    statusFor: (doc, totalRefunded) => {
      if (!["Confirmed", "Partial", "Paid"].includes(doc.status)) return doc.status;
      const total = Number(doc.grandTotal) || 0;
      // Closed by agreement for less than the return value. Still requires real
      // money behind it, so removing every refund drops it back out of Paid.
      if (doc.refundSettled && totalRefunded > EPSILON) return "Paid";
      if (totalRefunded >= total - EPSILON && total > 0) return "Paid";
      if (totalRefunded > 0) return "Partial";
      return "Confirmed";
    },
  },
};

// Fallback only — both directions are ambiguous, so callers that can settle a
// return pass documentType explicitly.
const docTypeForDirection = (direction) =>
  direction === "IN" ? "Invoice" : "Purchase";

// Every document type a payment in this direction may settle.
const docTypesForDirection = (direction) =>
  Object.keys(DOC_CONFIG).filter((type) => DOC_CONFIG[type].direction === direction);

// --- Reading open documents ---

// Invoices and Sales Returns reach their customer through a Deal, not directly,
// so resolve the party's deals first and scope on those.
async function dealScopedQueryForParty(orgId, partyType, partyId) {
  const dealFilter = { organization: orgId };
  if (partyType === "Company") dealFilter.company = partyId;
  else if (partyType === "Contact") dealFilter.contact = partyId;
  else return null;

  const deals = await Deal.find(dealFilter).select("_id").lean();
  return { organization: orgId, deal: { $in: deals.map((d) => d._id) } };
}

// Every not-fully-settled document for this party. Only Cancelled is filtered
// out — the money, not the status string, decides what's still open.
async function getOpenDocuments({ orgId, direction, partyType, partyId, documentType: requestedType }) {
  // The party disambiguates when the caller didn't name a type: IN from a
  // vendor is a PurchaseReturn refund, OUT to a customer a SalesReturn refund.
  const isCustomer = partyType === "Company" || partyType === "Contact";
  const documentType =
    requestedType ||
    (direction === "IN" && partyType === "Vendor"
      ? "PurchaseReturn"
      : direction === "OUT" && isCustomer
        ? "SalesReturn"
        : docTypeForDirection(direction));
  const cfg = DOC_CONFIG[documentType];

  let filter;
  if (documentType === "Invoice") {
    filter = await dealScopedQueryForParty(orgId, partyType, partyId);
    if (!filter) return { documentType, documents: [] };
  } else if (documentType === "SalesReturn") {
    // Only a Confirmed return can be refunded. Scoped through the deal.
    filter = await dealScopedQueryForParty(orgId, partyType, partyId);
    if (!filter) return { documentType, documents: [] };
    filter.status = { $in: ["Confirmed", "Partial", "Paid"] };
  } else if (documentType === "PurchaseReturn") {
    // Only a Confirmed return can be refunded — the goods have to have left
    // before the vendor owes anything back.
    filter = {
      organization: orgId,
      vendor: partyId,
      status: { $in: ["Confirmed", "Partial", "Paid"] },
    };
  } else {
    filter = { organization: orgId, vendor: partyId, status: { $ne: "Cancelled" } };
  }

  const docs = await cfg.model.find(filter).lean();

  const documents = docs
    .map((doc) => {
      const total = round2(cfg.totalOf(doc));
      const paid = round2(sumPayments(doc.payments));
      const due = round2(total - paid);
      return {
        _id: doc._id,
        documentType,
        number: cfg.numberOf(doc) || "",
        date: cfg.dateOf(doc),
        dueDate: doc.dueDate || null,
        status: doc.status,
        total,
        paid,
        due,
      };
    })
    .filter((d) => d.due > EPSILON)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return { documentType, documents };
}

// Every open document in the org, tagged with its party name — credit isn't
// restricted to the party it came from, so this backs the "search any" picker.
async function getAllOpenDocuments({ orgId, direction }) {
  const documentType = docTypeForDirection(direction);
  const cfg = DOC_CONFIG[documentType];

  if (documentType === "Invoice") {
    const invoices = await cfg.model
      .find({ organization: orgId })
      // An invoice's customer hangs off its Deal — there's no direct link.
      .populate({
        path: "deal",
        select: "title company contact",
        populate: [
          { path: "company", select: "name" },
          { path: "contact", select: "name" },
        ],
      })
      .lean();

    return {
      documentType,
      documents: invoices
        .map((doc) => {
          const total = round2(cfg.totalOf(doc));
          const paid = round2(sumPayments(doc.payments));
          const party =
            doc.deal?.company?.name || doc.deal?.contact?.name || doc.deal?.title || "Unknown customer";
          const partyType = doc.deal?.company ? "Company" : doc.deal?.contact ? "Contact" : null;
          const partyId = doc.deal?.company?._id || doc.deal?.contact?._id || null;
          return {
            _id: doc._id,
            documentType,
            number: cfg.numberOf(doc) || "",
            date: cfg.dateOf(doc),
            dueDate: doc.dueDate || null,
            status: doc.status,
            partyName: party,
            partyType,
            partyId,
            total,
            paid,
            due: round2(total - paid),
          };
        })
        .filter((d) => d.due > EPSILON)
        .sort((a, b) => new Date(a.date) - new Date(b.date)),
    };
  }

  const purchases = await cfg.model
    .find({ organization: orgId, status: { $ne: "Cancelled" } })
    .populate("vendor", "name companyName")
    .lean();

  return {
    documentType,
    documents: purchases
      .map((doc) => {
        const total = round2(cfg.totalOf(doc));
        const paid = round2(sumPayments(doc.payments));
        return {
          _id: doc._id,
          documentType,
          number: cfg.numberOf(doc) || "",
          date: cfg.dateOf(doc),
          dueDate: null,
          status: doc.status,
          partyName: doc.vendor?.companyName || doc.vendor?.name || "Unknown vendor",
          partyType: "Vendor",
          partyId: doc.vendor?._id || null,
          total,
          paid,
          due: round2(total - paid),
        };
      })
      .filter((d) => d.due > EPSILON)
      .sort((a, b) => new Date(a.date) - new Date(b.date)),
  };
}

// --- Applying allocations ---

class AllocationError extends Error {
  constructor(message) {
    super(message);
    this.name = "AllocationError";
    this.statusCode = 400;
  }
}

// Validates a split without writing: correct type, same org, no line over what
// its document owes, no duplicates, total within the payment. Returns the docs.
async function validateAllocations({ orgId, direction, amount, allocations, documentType: requestedType }) {
  // Type comes from the caller or the lines; without either, fall back to the
  // direction's default so older callers behave unchanged.
  const lineType = allocations.find((a) => a && a.documentType)?.documentType;
  const documentType = requestedType || lineType || docTypeForDirection(direction);

  const cfg = DOC_CONFIG[documentType];
  if (!cfg) {
    throw new AllocationError(`Unsupported document type: ${documentType}`);
  }
  if (cfg.direction !== direction) {
    const label = direction === "IN" ? "Credit" : "Debit";
    const allowed = docTypesForDirection(direction).join(" or ");
    throw new AllocationError(`A ${label} payment can only be allocated to ${allowed}.`);
  }

  const cleaned = [];
  const seen = new Set();

  for (const raw of allocations) {
    const docId = raw.documentId || raw.document || raw._id;
    const allocAmount = round2(raw.amount);

    if (!mongoose.isValidObjectId(docId)) {
      throw new AllocationError("An allocation is missing a valid document reference.");
    }
    if (!Number.isFinite(allocAmount) || allocAmount <= 0) {
      throw new AllocationError("Every allocation must be greater than 0.");
    }
    // One payment splits across one KIND of document — mixing an invoice and
    // a purchase return in a single split has no meaning.
    if (raw.documentType && raw.documentType !== documentType) {
      throw new AllocationError(
        `One payment can't be split across ${documentType} and ${raw.documentType} documents.`
      );
    }
    const key = String(docId);
    if (seen.has(key)) {
      throw new AllocationError("The same document appears twice in the allocation — combine those lines.");
    }
    seen.add(key);
    cleaned.push({ documentId: docId, amount: allocAmount });
  }

  const totalAllocated = round2(cleaned.reduce((s, a) => s + a.amount, 0));
  const paymentAmount = round2(amount);
  if (totalAllocated > paymentAmount + EPSILON) {
    throw new AllocationError(
      `Allocations total ₹${totalAllocated.toFixed(2)}, which is more than the payment of ₹${paymentAmount.toFixed(2)}.`
    );
  }

  const docs = await cfg.model.find({
    _id: { $in: cleaned.map((a) => a.documentId) },
    organization: orgId,
  });

  if (docs.length !== cleaned.length) {
    throw new AllocationError("One or more of the selected documents could not be found.");
  }

  const byId = new Map(docs.map((d) => [String(d._id), d]));

  for (const alloc of cleaned) {
    const doc = byId.get(String(alloc.documentId));
    const due = round2(cfg.totalOf(doc) - sumPayments(doc.payments));
    if (alloc.amount > due + EPSILON) {
      const label = cfg.numberOf(doc) || String(doc._id).slice(-6);
      throw new AllocationError(
        `₹${alloc.amount.toFixed(2)} allocated to ${label} exceeds its remaining balance of ₹${due.toFixed(2)}.`
      );
    }
  }

  return { documentType, cleaned, docs: byId, totalAllocated };
}

// Writes a validated split: a payments[] subdoc per document, a
// PaymentAllocation linking it back, and the Payment's running total. No
// transactions on standalone Mongo, so a mid-way failure reverses what landed.
async function applyAllocations({ orgId, userId, payment, allocations, documentType: requestedType }) {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    return { allocations: [], totalAllocated: 0 };
  }

  const { documentType, cleaned, docs } = await validateAllocations({
    orgId,
    direction: payment.direction,
    amount: round2(payment.amount) - round2(payment.allocatedAmount || 0),
    allocations,
    documentType: requestedType,
  });

  const cfg = DOC_CONFIG[documentType];
  const written = [];

  try {
    for (const alloc of cleaned) {
      const doc = docs.get(String(alloc.documentId));
      const alreadyPaid = sumPayments(doc.payments);

      doc.payments.push({
        amount: alloc.amount,
        paymentDate: payment.paymentDate || new Date(),
        paymentMethod: toPaymentMethod(payment.paymentType),
        reference: payment.reference || "",
        notes: payment.notes || "",
        internalNotes: "",
        recordedBy: userId,
        recordedAt: new Date(),
      });

      const subdoc = doc.payments[doc.payments.length - 1];
      doc.status = cfg.statusFor(doc, alreadyPaid + alloc.amount);

      // validateModifiedOnly: legacy field values on older docs would fail a
      // full re-validation, and we aren't touching them.
      await doc.save({ validateModifiedOnly: true });

      const record = await PaymentAllocation.create({
        payment: payment._id,
        documentType,
        document: doc._id,
        documentPaymentId: subdoc._id,
        amount: alloc.amount,
        organization: orgId,
        user: userId,
      });

      written.push(record);
    }
  } catch (err) {
    // Roll back the partial split so the documents are not left holding
    // payments that no Payment record accounts for.
    for (const record of written) {
      try {
        await reverseAllocation(record);
      } catch (rollbackErr) {
        console.error("Allocation rollback failed:", rollbackErr);
      }
    }
    throw err;
  }

  const totalAllocated = round2(written.reduce((s, a) => s + a.amount, 0));
  payment.allocatedAmount = round2((Number(payment.allocatedAmount) || 0) + totalAllocated);
  await payment.save({ validateModifiedOnly: true });

  return { allocations: written, totalAllocated };
}

// --- Reversing ---

// Pulls the subdoc this allocation pushed back out of its document, restores
// the document's status from what is left, and deletes the allocation row.
async function reverseAllocation(record) {
  const cfg = DOC_CONFIG[record.documentType];
  if (!cfg) return;

  const doc = await cfg.model.findOne({
    _id: record.document,
    organization: record.organization,
  });

  if (doc && record.documentPaymentId) {
    const subdoc = doc.payments.id(record.documentPaymentId);
    if (subdoc) {
      subdoc.deleteOne();
      doc.status = cfg.statusFor(doc, sumPayments(doc.payments));
      await doc.save({ validateModifiedOnly: true });
    }
  }

  await PaymentAllocation.deleteOne({ _id: record._id });
}

// Undoes every allocation on a payment, so the documents it settled go back to
// showing that balance as outstanding. Called when the payment is deleted.
async function reverseAllocationsForPayment(paymentId) {
  const records = await PaymentAllocation.find({ payment: paymentId });
  for (const record of records) {
    await reverseAllocation(record);
  }
  return records.length;
}

// Cancels a document's settlement without destroying the money. Allocations are
// unwound but the Payment rows are KEPT, becoming unallocated party credit.
// Deleting a document instead removes them (removeDocumentPayment).
async function reverseDocumentAllocations({ orgId, documentType, documentId }) {
  const records = await PaymentAllocation.find({
    organization: orgId,
    documentType,
    document: documentId,
  });

  for (const record of records) {
    const paymentId = record.payment;
    // Pulls the subdoc, recomputes the (soon-to-be-Cancelled) document's
    // status from what's left, and deletes the allocation row.
    await reverseAllocation(record);

    // Keep the Payment; just free up the amount it was holding against this
    // document so it surfaces as credit rather than vanishing.
    const payment = await Payment.findById(paymentId);
    if (payment) {
      payment.allocatedAmount = Math.max(0, round2((Number(payment.allocatedAmount) || 0) - record.amount));
      await payment.save({ validateModifiedOnly: true });
    }
  }

  return records.length;
}

// What each payment settled, resolved to the document's own number. Returns
// Map(paymentId -> [{documentType, documentId, number, amount}]); unallocated
// payments are absent.
async function getAllocationSourcesForPayments({ orgId, paymentIds }) {
  if (!Array.isArray(paymentIds) || paymentIds.length === 0) return new Map();

  const allocations = await PaymentAllocation.find({
    organization: orgId,
    payment: { $in: paymentIds },
  }).lean();

  // Resolve document numbers one query per type rather than per allocation.
  const idsByType = {};
  for (const a of allocations) {
    (idsByType[a.documentType] ||= new Set()).add(String(a.document));
  }

  const numberByKey = new Map();
  await Promise.all(
    Object.entries(idsByType).map(async ([type, idSet]) => {
      const cfg = DOC_CONFIG[type];
      if (!cfg) return;
      const docs = await cfg.model.find({ _id: { $in: Array.from(idSet) } }).lean();
      for (const d of docs) {
        numberByKey.set(`${type}:${String(d._id)}`, cfg.numberOf(d) || "");
      }
    })
  );

  const byPayment = new Map();
  for (const a of allocations) {
    const key = String(a.payment);
    if (!byPayment.has(key)) byPayment.set(key, []);
    byPayment.get(key).push({
      documentType: a.documentType,
      documentId: a.document,
      number: numberByKey.get(`${a.documentType}:${String(a.document)}`) || "",
      amount: round2(a.amount),
    });
  }

  return byPayment;
}

// Allocations already recorded against one document, for display alongside
// its own payments list.
async function getAllocationsForDocument({ orgId, documentType, documentId }) {
  return PaymentAllocation.find({
    organization: orgId,
    documentType,
    document: documentId,
  })
    .populate("payment", "amount paymentDate paymentType reference direction")
    .lean();
}

// --- Credit balances ---

// Unallocated money per party — what a later allocation draws down.
async function getCreditBalances({ orgId, direction = null, partyType = null, partyId = null }) {
  const filter = { organization: orgId };
  if (direction) filter.direction = direction;
  if (partyType && partyId) {
    filter.partyType = partyType;
    filter.party = partyId;
  }

  // No .populate(): a lean populate that misses a deleted party returns null
  // and would make real unapplied money vanish. Names are resolved separately
  // so a dangling reference costs only the label.
  const payments = await Payment.find(filter).lean();

  const buckets = new Map();

  for (const p of payments) {
    const unallocated = round2((Number(p.amount) || 0) - (Number(p.allocatedAmount) || 0));
    if (unallocated <= EPSILON) continue;

    // Fall back to the legacy `vendor` pointer for rows written before
    // partyType/party existed.
    const type = p.partyType || (p.vendor ? "Vendor" : null);
    const rawId = p.party || p.vendor;
    if (!type || !rawId) continue;

    const id = String(rawId);
    const key = `${type}:${id}`;

    if (!buckets.has(key)) {
      buckets.set(key, {
        partyType: type,
        partyId: id,
        partyName: "",
        direction: p.direction,
        creditBalance: 0,
        payments: [],
      });
    }

    const bucket = buckets.get(key);
    bucket.creditBalance = round2(bucket.creditBalance + unallocated);
    bucket.payments.push({
      _id: p._id,
      amount: round2(p.amount),
      allocatedAmount: round2(p.allocatedAmount),
      unallocatedAmount: unallocated,
      paymentDate: p.paymentDate,
      reference: p.reference || "",
    });
  }

  // Resolve display names, one query per party type rather than per payment.
  const MODELS = {
    Company: require("../models/Company"),
    Contact: require("../models/Contact"),
    Vendor: require("../models/Vendor"),
  };

  const byType = new Map();
  for (const bucket of buckets.values()) {
    if (!byType.has(bucket.partyType)) byType.set(bucket.partyType, []);
    byType.get(bucket.partyType).push(bucket.partyId);
  }

  const names = new Map();
  await Promise.all(
    Array.from(byType.entries()).map(async ([type, ids]) => {
      const Model = MODELS[type];
      if (!Model) return;
      const docs = await Model.find({ _id: { $in: ids } }).select("name companyName").lean();
      for (const d of docs) {
        names.set(`${type}:${String(d._id)}`, d.companyName || d.name || "Unnamed");
      }
    })
  );

  for (const bucket of buckets.values()) {
    const key = `${bucket.partyType}:${bucket.partyId}`;
    // A party record that no longer exists still has its money shown — the
    // balance is real even when the contact card behind it is gone.
    bucket.partyName = names.get(key) || "Deleted party";
    bucket.orphaned = !names.has(key);
  }

  return Array.from(buckets.values()).sort((a, b) => b.creditBalance - a.creditBalance);
}

// Spends a party's credit against their open documents. Credit can span several
// payments while an allocation belongs to one, so each line is drawn FIFO from
// the oldest unallocated payments, splitting where one can't cover it.
async function applyCreditBalance({ orgId, userId, partyType, partyId, direction, allocations }) {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    throw new AllocationError("At least one allocation is required.");
  }

  // Validate the whole request against the documents BEFORE drawing anything
  // down, so a bad line can't leave a half-spent credit balance behind.
  const totalRequested = round2(
    allocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
  );

  const payments = await Payment.find({
    organization: orgId,
    partyType,
    party: partyId,
    direction,
  })
    .sort({ paymentDate: 1, createdAt: 1 });

  const withCredit = payments.filter(
    (p) => round2((Number(p.amount) || 0) - (Number(p.allocatedAmount) || 0)) > EPSILON
  );

  const available = round2(
    withCredit.reduce(
      (sum, p) => sum + ((Number(p.amount) || 0) - (Number(p.allocatedAmount) || 0)),
      0
    )
  );

  if (totalRequested > available + EPSILON) {
    throw new AllocationError(
      `₹${totalRequested.toFixed(2)} requested but only ₹${available.toFixed(2)} of credit is available.`
    );
  }

  // Re-uses the same per-document checks (belongs to org, within its balance,
  // right type for the direction) that a fresh payment goes through.
  await validateAllocations({ orgId, direction, amount: available, allocations });

  const applied = [];
  let paymentIndex = 0;

  for (const line of allocations) {
    let remaining = round2(line.amount);

    while (remaining > EPSILON) {
      const payment = withCredit[paymentIndex];
      if (!payment) {
        throw new AllocationError("Ran out of credit while applying — refresh and try again.");
      }

      const paymentCredit = round2(
        (Number(payment.amount) || 0) - (Number(payment.allocatedAmount) || 0)
      );
      if (paymentCredit <= EPSILON) {
        paymentIndex += 1;
        continue;
      }

      const take = round2(Math.min(paymentCredit, remaining));
      const result = await applyAllocations({
        orgId,
        userId,
        payment,
        allocations: [{ documentId: line.documentId || line.document, amount: take }],
      });

      applied.push(...result.allocations);
      remaining = round2(remaining - take);
      if (round2(paymentCredit - take) <= EPSILON) paymentIndex += 1;
    }
  }

  return {
    applied,
    totalApplied: round2(applied.reduce((s, a) => s + a.amount, 0)),
    remainingCredit: round2(available - totalRequested),
  };
}

// Document-side payments — the bill-side entry points. They run through the
// same allocation path, so a bill payment also shows as real money on the
// party's page. The Payment they create is flagged isDocumentPayment, which is
// what lets removeDocumentPayment delete the money row with the document line;
// a standalone Gave/Got isn't flagged, so unallocating it leaves it as credit.

// The party a document's payment is with, and which way the money moved.
async function partyForDocument(documentType, doc) {
  if (documentType === "Purchase") {
    if (!doc.vendor) throw new AllocationError("This purchase has no vendor, so a payment can't be attributed.");
    return { direction: "OUT", partyType: "Vendor", party: doc.vendor, vendor: doc.vendor };
  }

  // A refund on a return comes FROM the vendor, so it is money IN from the
  // same party the original bill was paid to.
  if (documentType === "PurchaseReturn") {
    if (!doc.vendor) throw new AllocationError("This return has no vendor, so a refund can't be attributed.");
    return { direction: "IN", partyType: "Vendor", party: doc.vendor, vendor: doc.vendor };
  }

  // A sales return refund goes OUT to the customer, resolved via the return's
  // own deal the same way an invoice's is.
  if (documentType === "SalesReturn") {
    const srDeal = doc.deal ? await Deal.findById(doc.deal).select("company contact").lean() : null;
    if (srDeal?.company) return { direction: "OUT", partyType: "Company", party: srDeal.company };
    if (srDeal?.contact) return { direction: "OUT", partyType: "Contact", party: srDeal.contact };
    return { direction: "OUT", partyType: undefined, party: undefined };
  }

  // Invoice -> Deal -> customer (company or contact). Left unresolved rather
  // than guessed when the deal is missing: a payment with no party is still a
  // real cash movement and must not be dropped.
  const deal = doc.deal ? await Deal.findById(doc.deal).select("company contact").lean() : null;
  if (deal?.company) return { direction: "IN", partyType: "Company", party: deal.company };
  if (deal?.contact) return { direction: "IN", partyType: "Contact", party: deal.contact };
  return { direction: "IN", partyType: undefined, party: undefined };
}

// Creates the money row for a payment made on a document and allocates it to
// that document in one step. Returns both, plus the reloaded document.
async function recordDocumentPayment({
  orgId, userId, documentType, documentId, amount,
  paymentDate, paymentMethod, reference, notes, bank,
}) {
  const cfg = DOC_CONFIG[documentType];
  if (!cfg) throw new AllocationError(`Unsupported document type: ${documentType}`);

  const parsedAmount = round2(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new AllocationError("A valid payment amount greater than 0 is required.");
  }

  const doc = await cfg.model.findOne({ _id: documentId, organization: orgId });
  if (!doc) throw new AllocationError("Document not found.");

  const { direction, partyType, party, vendor } = await partyForDocument(documentType, doc);

  const payment = await Payment.create({
    vendor,
    partyType,
    party,
    amount: parsedAmount,
    allocatedAmount: 0,
    paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
    paymentType: toPaymentMethod(paymentMethod),
    bank: bank || undefined,
    reference: reference || "",
    notes: notes || "",
    direction,
    isDocumentPayment: true,
    user: userId,
    organization: orgId,
  });

  try {
    const { allocations } = await applyAllocations({
      orgId,
      userId,
      payment,
      allocations: [{ documentId: doc._id, amount: parsedAmount }],
      // Named explicitly: IN alone is ambiguous now that a credit can settle
      // either an Invoice or a Purchase Return.
      documentType,
    });

    return {
      payment,
      allocation: allocations[0],
      document: await cfg.model.findById(doc._id),
    };
  } catch (err) {
    // The money row is only meaningful together with its allocation, so a
    // failed allocation takes it back out rather than leaving an orphan
    // inflating the party's credit balance.
    await Payment.deleteOne({ _id: payment._id });
    throw err;
  }
}

// The allocation behind one of a document's payments[] subdocs, if it has one.
// Payments recorded before the two systems were unified have no allocation —
// callers fall back to editing the subdoc directly for those.
async function allocationForDocumentPayment({ orgId, documentType, documentId, documentPaymentId }) {
  return PaymentAllocation.findOne({
    organization: orgId,
    documentType,
    document: documentId,
    documentPaymentId,
  });
}

// Edits a payment already on a document, keeping the money row, allocation and
// subdoc in step. Ids are preserved so it keeps its place in the party's ledger.
async function updateDocumentPayment({
  orgId, userId, documentType, documentId, documentPaymentId, amount,
  paymentDate, paymentMethod, reference, notes,
}) {
  const cfg = DOC_CONFIG[documentType];
  if (!cfg) throw new AllocationError(`Unsupported document type: ${documentType}`);

  const doc = await cfg.model.findOne({ _id: documentId, organization: orgId });
  if (!doc) throw new AllocationError("Document not found.");

  const subdoc = doc.payments.id(documentPaymentId);
  if (!subdoc) throw new AllocationError("Payment not found.");

  const parsedAmount = round2(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new AllocationError("A valid payment amount greater than 0 is required.");
  }

  // Everything else on the document keeps its current contribution, so the
  // ceiling for this line is the total less what the other lines already pay.
  const otherPaid = round2(
    sumPayments(doc.payments.filter((p) => String(p._id) !== String(documentPaymentId)))
  );
  const due = round2(cfg.totalOf(doc) - otherPaid);
  if (parsedAmount > due + EPSILON) {
    throw new AllocationError(`Payment cannot exceed the remaining balance of ₹${due.toFixed(2)}.`);
  }

  subdoc.amount = parsedAmount;
  if (paymentDate) subdoc.paymentDate = new Date(paymentDate);
  if (paymentMethod) subdoc.paymentMethod = toPaymentMethod(paymentMethod);
  if (reference !== undefined) subdoc.reference = reference;
  if (notes !== undefined) subdoc.notes = notes;

  doc.status = cfg.statusFor(doc, round2(otherPaid + parsedAmount));
  await doc.save({ validateModifiedOnly: true });

  const record = await allocationForDocumentPayment({ orgId, documentType, documentId, documentPaymentId });
  if (record) {
    const delta = round2(parsedAmount - record.amount);
    record.amount = parsedAmount;
    await record.save();

    const payment = await Payment.findById(record.payment);
    if (payment) {
      payment.allocatedAmount = round2((Number(payment.allocatedAmount) || 0) + delta);
      // A payment raised on the document itself IS this line, so its own
      // amount tracks it. A standalone Gave/Got only has its allocated
      // portion changed — the rest stays as the party's credit.
      if (payment.isDocumentPayment) payment.amount = parsedAmount;
      if (paymentDate) payment.paymentDate = new Date(paymentDate);
      if (paymentMethod) payment.paymentType = toPaymentMethod(paymentMethod);
      if (reference !== undefined) payment.reference = reference;
      if (notes !== undefined) payment.notes = notes;
      await payment.save({ validateModifiedOnly: true });
    }
  }

  return { document: await cfg.model.findById(doc._id) };
}

// Removes one of a document's payments via reverseAllocation; the money row
// goes too when it was raised on the document and nothing else uses it.
async function removeDocumentPayment({ orgId, documentType, documentId, documentPaymentId }) {
  const cfg = DOC_CONFIG[documentType];
  if (!cfg) throw new AllocationError(`Unsupported document type: ${documentType}`);

  const doc = await cfg.model.findOne({ _id: documentId, organization: orgId });
  if (!doc) throw new AllocationError("Document not found.");

  const subdoc = doc.payments.id(documentPaymentId);
  if (!subdoc) throw new AllocationError("Payment not found.");

  const record = await allocationForDocumentPayment({ orgId, documentType, documentId, documentPaymentId });

  if (!record) {
    // Legacy payment with no money row behind it — remove the subdoc and
    // recompute, which is exactly what this endpoint did before.
    subdoc.deleteOne();
    doc.status = cfg.statusFor(doc, sumPayments(doc.payments));
    await doc.save({ validateModifiedOnly: true });
    return { document: await cfg.model.findById(doc._id) };
  }

  const paymentId = record.payment;
  await reverseAllocation(record);

  const payment = await Payment.findById(paymentId);
  if (payment?.isDocumentPayment) {
    const remaining = await PaymentAllocation.countDocuments({ payment: paymentId });
    if (remaining === 0) {
      await Payment.deleteOne({ _id: paymentId });
    } else {
      payment.allocatedAmount = round2((Number(payment.allocatedAmount) || 0) - record.amount);
      await payment.save({ validateModifiedOnly: true });
    }
  } else if (payment) {
    payment.allocatedAmount = round2((Number(payment.allocatedAmount) || 0) - record.amount);
    await payment.save({ validateModifiedOnly: true });
  }

  return { document: await cfg.model.findById(doc._id) };
}

module.exports = {
  AllocationError,
  applyCreditBalance,
  DOC_CONFIG,
  docTypeForDirection,
  getOpenDocuments,
  getAllOpenDocuments,
  validateAllocations,
  applyAllocations,
  reverseAllocation,
  reverseAllocationsForPayment,
  reverseDocumentAllocations,
  getAllocationsForDocument,
  getAllocationSourcesForPayments,
  getCreditBalances,
  recordDocumentPayment,
  updateDocumentPayment,
  removeDocumentPayment,
  allocationForDocumentPayment,
  round2,
  sumPayments,
};
