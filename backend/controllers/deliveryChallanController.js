const { buildFuzzySearchPattern } = require('../utils/searchRegex');
const DeliveryChallan = require("../models/deliveryChallan");
const getDefaultBankDetails = require("../utils/getDefaultBankDetails");
const resolveBankDetails = require("../utils/resolveBankDetails");
const Branding = require("../models/Branding");
const htmlDocumentPdf = require("../utils/htmlDocumentPdf");
const sendGridMail = require("../utils/sendGridMail");
const { renderEmail } = require("../utils/emailLayout");
const mongoose = require("mongoose");
const Deal = require("../models/Deal");
const { getDocumentSettingsForOrganization, resolveDocumentNumber } = require("../utils/documentNumbering");
const { getOwnedDealIds } = require("../utils/ownedCompanies");

// A user with own-only permission may only touch delivery challans they
// own. record.user may be a raw ObjectId or, if a caller populates it, a
// User subdocument — handle both so a populated lookup doesn't
// false-negative. DeliveryChallan links to a company only indirectly via
// `deal -> Deal.company`, so a challan under a deal whose company this user
// OWNS counts as owned too — mirrors contactController's isOwnedByUser,
// swapping company/ownedCompanyIds for deal/ownedDealIds (via
// getOwnedDealIds). `ownedDealIds` is optional.
const isOwnedByUser = (record, userId, ownedDealIds = []) => {
  const uid = userId.toString();
  const recordUserId = record.user?._id ?? record.user;
  if (recordUserId?.toString() === uid) return true;

  const dealId = (record.deal?._id ?? record.deal)?.toString();
  return !!dealId && ownedDealIds.some((id) => id.toString() === dealId);
};

// Utility function to format date as YYYYMMDD
const formatDate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
};

// Create Delivery Challan
exports.createDeliveryChallan = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      deal,
      date,
      dueDate,
      amount,
      status,
      items,
      notes,
      terms,
      signature,
      signatureType,
      discount,
      bankDetails,
      isRoundOff,
      transactionType,
      receiverGSTIN,
      gstRate,
      billingAddress,
      shippingAddress,
      deliveryChallanPrefix,
      deliveryChallanSuffix,
      deliveryChallanNumber: clientDeliveryChallanNumber,
      reference,
    } = req.body;

    // Validate required fields
    const requiredFields = ["deal", "date", "amount", "status", "discount"];
    for (const field of requiredFields) {
      if (!req.body[field]) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(400)
          .json({ error: `Missing required field: ${field}` });
      }
    }

    // Validate items
    if (!items || !Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: "At least one item is required" });
    }
    for (const item of items) {
      if (!item.name || !item.rate || !item.quantity) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(400)
          .json({ error: "All items must have name, rate, and quantity" });
      }
    }

    // Delivery challan number: Document Settings' configured prefix
    // (documentTypeSettings.deliveryChallan.prefix) is the source of truth
    // when the client doesn't send one. Previously this type had no
    // prefix-acceptance at all — every challan was hardcoded "DC-N"
    // regardless of what Settings said. Numbering is scoped to the resolved
    // prefix specifically, so switching prefixes restarts (or resumes)
    // cleanly instead of continuing another prefix's sequence.
    const documentSettings = await getDocumentSettingsForOrganization(req.user.organization);
    const finalDCPrefix = (deliveryChallanPrefix && deliveryChallanPrefix.trim()) || documentSettings.documentTypeSettings?.deliveryChallan?.prefix || "DC-";
    const finalDCSuffix = (deliveryChallanSuffix ?? documentSettings.documentTypeSettings?.deliveryChallan?.suffix ?? "").toString().trim();
    let deliveryChallanNumber;
    try {
      deliveryChallanNumber = await resolveDocumentNumber({
        Model: DeliveryChallan,
        numberField: "deliveryChallanNumber",
        organization: req.user.organization,
        documentTypeKey: "deliveryChallan",
        prefix: finalDCPrefix,
        suffix: finalDCSuffix,
        providedNumber: clientDeliveryChallanNumber && String(clientDeliveryChallanNumber).trim() ? clientDeliveryChallanNumber : null,
        session,
      });
    } catch (numErr) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: numErr.message });
    }

    const dealDoc = await Deal.findById(deal).populate('company');
    let finalBillingAddress = billingAddress;
    let finalShippingAddress = shippingAddress;

    if (dealDoc && dealDoc.company) {
      if (!finalBillingAddress || Object.keys(finalBillingAddress).length === 0) {
        finalBillingAddress = dealDoc.company.billingAddress || {};
      }
      if (!finalShippingAddress || Object.keys(finalShippingAddress).length === 0) {
        finalShippingAddress = dealDoc.company.shippingAddresses?.[0] || {};
      }
    }

    const deliveryChallan = new DeliveryChallan({
      deal,
      deliveryChallanNumber,
      date,
      dueDate,
      amount,
      status,
      items,
      notes: notes || "",
      terms: terms || "",
      reference: reference || "",
      signature,
      signatureType: signatureType || "text",
      discount: discount || { type: "fixed", value: 0 },
      // Bank account chosen on the form; the PDF prints it (utils/resolveBankDetails.js).
      bankDetails: bankDetails || null,
      ...(isRoundOff !== undefined && { isRoundOff: !!isRoundOff }),
      // Tax data, same shape as an invoice (see models/deliveryChallan.js).
      transactionType: transactionType === "inter" ? "inter" : "intra",
      receiverGSTIN: receiverGSTIN || "",
      ...(gstRate !== undefined && { gstRate: parseFloat(gstRate) || 0 }),
      billingAddress: finalBillingAddress,
      shippingAddress: finalShippingAddress,
      user: req.user.id,
      organization: req.user.organization,
    });

    await deliveryChallan.save({ session });
    await session.commitTransaction();
    session.endSession();

    res.status(201).json(deliveryChallan);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res
      .status(500)
      .json({ error: `Failed to create delivery challan: ${err.message}` });
  }
};

// Duplicate: clones an existing delivery challan into a brand-new Draft
// challan with a freshly generated number. Does not touch the source.
exports.duplicateDeliveryChallan = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const source = await DeliveryChallan.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    }).session(session);

    if (!source) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Delivery challan not found" });
    }

    const documentSettings = await getDocumentSettingsForOrganization(req.user.organization);
    const finalDCPrefix = documentSettings.documentTypeSettings?.deliveryChallan?.prefix || "DC-";
    const finalDCSuffix = (documentSettings.documentTypeSettings?.deliveryChallan?.suffix ?? "").toString().trim();

    let newDeliveryChallanNumber;
    try {
      newDeliveryChallanNumber = await resolveDocumentNumber({
        Model: DeliveryChallan,
        numberField: "deliveryChallanNumber",
        organization: req.user.organization,
        documentTypeKey: "deliveryChallan",
        prefix: finalDCPrefix,
        suffix: finalDCSuffix,
        providedNumber: null,
        session,
      });
    } catch (numErr) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: numErr.message });
    }

    // Bulk signature updates write via updateMany (no schema validation), so
    // older challans can carry a signatureType like "image" that the
    // ['text','upload'] enum never actually allowed. A new document's .save()
    // does validate, so that stale value must be normalized here rather than
    // copied straight through.
    const validSignatureTypes = ["text", "upload"];
    const normalizedSignatureType = validSignatureTypes.includes(source.signatureType)
      ? source.signatureType
      : (source.signature ? "upload" : "text");

    const duplicate = new DeliveryChallan({
      deal: source.deal,
      deliveryChallanNumber: newDeliveryChallanNumber,
      date: new Date(),
      amount: source.amount,
      status: "Draft",
      items: source.items,
      notes: source.notes,
      terms: source.terms,
      reference: source.reference,
      signature: source.signature,
      signatureType: normalizedSignatureType,
      discount: source.discount,
      bankDetails: source.bankDetails || null,
      isRoundOff: source.isRoundOff,
      transactionType: source.transactionType || "intra",
      receiverGSTIN: source.receiverGSTIN || "",
      gstRate: source.gstRate,
      billingAddress: source.billingAddress,
      shippingAddress: source.shippingAddress,
      user: req.user.id,
      organization: req.user.organization,
      duplicatedFrom: source._id,
    });

    await duplicate.save({ session });
    await session.commitTransaction();
    session.endSession();

    res.status(201).json(duplicate);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ error: `Failed to duplicate delivery challan: ${err.message}` });
  }
};

// Get All Delivery Challans
exports.getAllDeliveryChallans = async (req, res) => {
  try {
    const { search } = req.query;
    let query = { organization: req.user.organization };
    const andConditions = [];

    if (req.ownOnly) {
      const ownedDealIds = await getOwnedDealIds(req.user._id, req.user.organization);
      andConditions.push({
        $or: [{ user: req.user._id }, { deal: { $in: ownedDealIds } }],
      });
    }

    if (search) {
      const matchingDeals = await Deal.find(
        { organization: req.user.organization, title: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { _id: 1 }
      );
      andConditions.push({
        $or: [
          { status: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { deliveryChallanNumber: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { deal: { $in: matchingDeals.map((d) => d._id) } },
        ],
      });
    }

    if (andConditions.length > 0) {
      query.$and = andConditions;
    }

    const deliveryChallans = await DeliveryChallan.find(query).populate("deal");
    res.json(deliveryChallans);
  } catch (error) {
    res
      .status(500)
      .json({ message: `Failed to fetch delivery challans: ${error.message}` });
  }
};

// Get All Delivery Challans Paginated
exports.getAllDeliveryChallansPaginated = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;
    const {
      search,
      status,
      sortBy = "deliveryChallanNumber",
      sortOrder = "asc",
    } = req.query;

    const query = { organization: req.user.organization };
    const andConditions = [];

    if (req.ownOnly) {
      const ownedDealIds = await getOwnedDealIds(req.user._id, req.user.organization);
      andConditions.push({
        $or: [{ user: req.user._id }, { deal: { $in: ownedDealIds } }],
      });
    }

    if (search) {
      const matchingDeals = await Deal.find(
        { organization: req.user.organization, title: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { _id: 1 }
      );
      andConditions.push({
        $or: [
          { deliveryChallanNumber: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { status: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { deal: { $in: matchingDeals.map((d) => d._id) } },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$amount" },
                regex: search,
                options: "i",
              },
            },
          },
        ],
      });
    }

    if (andConditions.length > 0) {
      query.$and = andConditions;
    }

    if (status) query.status = status;

    const sortObj = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const [deliveryChallans, totalCount] = await Promise.all([
      DeliveryChallan.find(query)
        .populate("deal")
        .skip(skip)
        .limit(limit)
        .sort(sortObj)
        .lean()
        .select("-__v"),
      DeliveryChallan.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      deliveryChallans,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? page + 1 : null,
        prevPage: hasPrevPage ? page - 1 : null,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: `Failed to fetch delivery challans: ${error.message}` });
  }
};

// Download Delivery Challan
exports.downloadDeliveryChallan = async (req, res) => {
  try {
    const deliveryChallan = await DeliveryChallan.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    })
      .populate({
        path: "deal",
        populate: ["contact", "company"],
      })
      .populate("items.itemId");

    if (!deliveryChallan) {
      return res.status(404).json({ error: "Delivery Challan not found" });
    }

    const bankDetails = await resolveBankDetails(deliveryChallan, req.user.organization);
    const orgDetails = await Branding.findOne({
      organization: req.user.organization,
    }).sort({ updatedAt: -1 });

    // The template is resolved from the organization's document settings
    // inside htmlDocumentPdf, which renders the same markup as the live preview.
    const copyType = ["original", "duplicate", "triplicate"].includes(req.query.copyType)
      ? req.query.copyType
      : "original";
    const pdfBuffer = await htmlDocumentPdf(deliveryChallan, bankDetails, orgDetails, "deliveryChallan", copyType);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=delivery-challan-${deliveryChallan.deliveryChallanNumber}.pdf`,
    });
    return res.send(pdfBuffer);
  } catch (err) {
    res
      .status(500)
      .json({ error: `Failed to download delivery challan: ${err.message}` });
  }
};

// Delete Delivery Challan
exports.deleteDeliveryChallan = async (req, res) => {
  try {
    const deliveryChallan = await DeliveryChallan.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });

    if (!deliveryChallan) {
      return res.status(404).json({ error: "Delivery Challan not found" });
    }

    if (req.ownOnly) {
      const ownedDealIds = await getOwnedDealIds(req.user._id, req.user.organization);
      if (!isOwnedByUser(deliveryChallan, req.user._id, ownedDealIds)) {
        return res.status(403).json({ error: "You can only delete delivery challans you own" });
      }
    }

    await deliveryChallan.deleteOne();
    res.json({ message: "Delivery Challan deleted successfully" });
  } catch (err) {
    res
      .status(500)
      .json({ error: `Failed to delete delivery challan: ${err.message}` });
  }
};

// Update Delivery Challan
exports.updateDeliveryChallan = async (req, res) => {
  try {
    const {
      deal,
      date,
      dueDate,
      amount,
      status,
      items,
      notes,
      terms,
      signature,
      signatureType,
      discount,
      bankDetails,
      isRoundOff,
      transactionType,
      receiverGSTIN,
      gstRate,
      billingAddress,
      shippingAddress,
      reference,
    } = req.body;

    const requiredFields = ["deal", "date", "amount", "status", "discount"];
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res
          .status(400)
          .json({ error: `Missing required field: ${field}` });
      }
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "At least one item is required" });
    }
    for (const item of items) {
      if (!item.name || !item.rate || !item.quantity) {
        return res
          .status(400)
          .json({ error: "All items must have name, rate, and quantity" });
      }
    }

    const dealDoc = await Deal.findById(deal).populate('company');
    let finalBillingAddress = billingAddress;
    let finalShippingAddress = shippingAddress;

    if (dealDoc && dealDoc.company) {
      if (!finalBillingAddress || Object.keys(finalBillingAddress).length === 0) {
        finalBillingAddress = dealDoc.company.billingAddress || {};
      }
      if (!finalShippingAddress || Object.keys(finalShippingAddress).length === 0) {
        finalShippingAddress = dealDoc.company.shippingAddresses?.[0] || {};
      }
    }

    if (req.ownOnly) {
      const existing = await DeliveryChallan.findOne({
        _id: req.params.id,
        organization: req.user.organization,
      });
      if (!existing) {
        return res.status(404).json({ error: "Delivery Challan not found" });
      }
      const ownedDealIds = await getOwnedDealIds(req.user._id, req.user.organization);
      if (!isOwnedByUser(existing, req.user._id, ownedDealIds)) {
        return res.status(403).json({ error: "You can only edit delivery challans you own" });
      }
    }

    const deliveryChallan = await DeliveryChallan.findOneAndUpdate(
      {
        _id: req.params.id,
        organization: req.user.organization,
      },
      {
        deal,
        date,
        dueDate,
        amount,
        status,
        items,
        notes,
        terms,
        reference: reference || "",
        signature,
        signatureType,
        discount,
        // Only written when sent, so an update without them leaves the saved values alone.
        ...(bankDetails !== undefined && { bankDetails: bankDetails || null }),
        ...(isRoundOff !== undefined && { isRoundOff: !!isRoundOff }),
        // Only written when sent, so an update without tax fields leaves them unchanged.
        ...(transactionType !== undefined && { transactionType: transactionType === "inter" ? "inter" : "intra" }),
        ...(receiverGSTIN !== undefined && { receiverGSTIN: receiverGSTIN || "" }),
        ...(gstRate !== undefined && { gstRate: parseFloat(gstRate) || 0 }),
        billingAddress: finalBillingAddress,
        shippingAddress: finalShippingAddress,
      },
      { new: true }
    );

    if (!deliveryChallan) {
      return res.status(404).json({ error: "Delivery Challan not found" });
    }

    res.json({
      message: "Delivery Challan updated successfully",
      deliveryChallan,
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: `Failed to update delivery challan: ${err.message}` });
  }
};

// Update Delivery Challan Status
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    const deliveryChallan = await DeliveryChallan.findOneAndUpdate(
      { _id: req.params.id, organization: req.user.organization },
      { status },
      { new: true }
    );

    if (!deliveryChallan) {
      return res.status(404).json({ error: "Delivery Challan not found" });
    }

    res.json({
      message: "Delivery Challan status updated successfully",
      deliveryChallan,
    });
  } catch (err) {
    res.status(500).json({
      error: `Failed to update delivery challan status: ${err.message}`,
    });
  }
};

// Send Delivery Challan Email
exports.sendDeliveryChallanEmail = async (req, res) => {
  try {
    const deliveryChallan = await DeliveryChallan.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    })
      .populate({
        path: "deal",
        populate: ["contact", "company"],
      })
      .populate("items.itemId");

    if (!deliveryChallan) {
      return res.status(404).json({ error: "Delivery Challan not found" });
    }

    const bankDetails = await resolveBankDetails(deliveryChallan, req.user.organization);
    const orgDetails = await Branding.findOne({
      organization: req.user.organization,
    }).sort({ updatedAt: -1 });

    // The template is resolved from the organization's document settings
    // inside htmlDocumentPdf, which renders the same markup as the live preview.
    const pdfBuffer = await htmlDocumentPdf(deliveryChallan, bankDetails, orgDetails, "deliveryChallan");

    const companyName = orgDetails?.companyName || "";
    const contactName = deliveryChallan.deal.contactPerson || "Sir/Madam";
    const issueDate = deliveryChallan.date
      ? new Date(deliveryChallan.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
      : "";

    const senderName = companyName || "The sender";
    const mailOptions = {
      to: deliveryChallan.deal.email || req.body.email,
      replyTo: req.user.email,
      subject: `Delivery Challan ${deliveryChallan.deliveryChallanNumber}${companyName ? ` from ${companyName}` : ""}`,
      text: [
        `Hello ${contactName},`,
        "",
        `Please find attached delivery challan ${deliveryChallan.deliveryChallanNumber}${issueDate ? `, dated ${issueDate}` : ""}, covering the items dispatched to you.`,
        "",
        "Regards,",
        senderName,
      ].join("\n"),
      html: renderEmail({
        greetingName: contactName,
        intro: `Please find attached delivery challan ${deliveryChallan.deliveryChallanNumber}${issueDate ? `, dated ${issueDate}` : ""}, covering the items dispatched to you.`,
        blocks: [{ rows: [
          { label: "Delivery challan", value: deliveryChallan.deliveryChallanNumber },
          issueDate ? { label: "Date", value: issueDate } : null,
        ].filter(Boolean) }],
        signOff: senderName,
        preheader: `Delivery Challan ${deliveryChallan.deliveryChallanNumber} from ${senderName}`,
      }),
      attachments: [
        {
          filename: `DeliveryChallan-${deliveryChallan.deliveryChallanNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    };

    await sendGridMail(mailOptions);
    deliveryChallan.status = "Sent";
    await deliveryChallan.save();

    res.json({ message: "Delivery Challan emailed successfully" });
  } catch (error) {
    res.status(500).json({
      error: `Failed to send delivery challan email: ${error.message}`,
    });
  }
};
// Update ONLY Delivery Challan Number
exports.updateDeliveryChallanNumber = async (req, res) => {
  try {
    const { deliveryChallanNumber } = req.body;
    const id = req.params.id;

    if (!deliveryChallanNumber || typeof deliveryChallanNumber !== "string") {
      return res
        .status(400)
        .json({ error: "deliveryChallanNumber is required" });
    }

    const normalized = deliveryChallanNumber.trim();

    // Check duplicate
    const exists = await DeliveryChallan.findOne({
      deliveryChallanNumber: normalized,
      organization: req.user.organization,
      _id: { $ne: id },
    });

    if (exists) {
      return res
        .status(409)
        .json({ error: "Delivery Challan number already exists" });
    }

    const updated = await DeliveryChallan.findOneAndUpdate(
      { _id: id, organization: req.user.organization },
      { deliveryChallanNumber: normalized },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Delivery Challan not found" });
    }

    res.json({
      message: "Delivery Challan number updated successfully",
      deliveryChallan: updated,
    });
  } catch (err) {
    console.error("updateDeliveryChallanNumber error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.bulkUpdateStatus = async (req, res) => {
  try {
    const { ids, status } = req.body;
    if (!ids || !ids.length || !status) {
      return res.status(400).json({ error: "ids and status are required" });
    }
    // One findByIdAndUpdate per record (not a single updateMany) so the
    // change-notifier plugin's findOneAndUpdate hook fires per-record with a
    // real document to label, instead of one garbled notification for the
    // whole `$in` filter.
    await Promise.all(
      ids.map((id) =>
        DeliveryChallan.findOneAndUpdate(
          { _id: id, organization: req.user.organization },
          { status }
        )
      )
    );
    res.json({ message: `Updated ${ids.length} delivery challans to status: ${status}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.bulkUpdateSignature = async (req, res) => {
  try {
    const { ids, signature, signatureType } = req.body;
    if (!ids || !ids.length) {
      return res.status(400).json({ error: "ids are required" });
    }
    const challans = await DeliveryChallan.find({ _id: { $in: ids }, organization: req.user.organization }, '_id');
    const validIds = challans.map(c => c._id.toString());
    const failedIds = ids.filter(id => !validIds.includes(id));
    
    if (validIds.length > 0) {
      // Per-record findOneAndUpdate (not updateMany) so each challan gets its
      // own properly-labelled notification instead of one garbled entry for
      // the whole `$in` filter.
      await Promise.all(
        validIds.map((id) =>
          DeliveryChallan.findOneAndUpdate(
            { _id: id },
            { signature: signature || "", signatureType: signatureType || "text" }
          )
        )
      );
    }
    
    res.json({
      message: `Updated signature for ${validIds.length} delivery challans`,
      successfulIds: validIds,
      failedIds
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
