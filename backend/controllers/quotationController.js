const { buildFuzzySearchPattern } = require('../utils/searchRegex');
const Quotation = require("../models/quotation");
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

// A user with own-only permission may only touch quotations they own.
// record.user may be a raw ObjectId or, if a caller populates it, a User
// subdocument — handle both so a populated lookup doesn't false-negative.
// Quotation links to a company only indirectly via `deal -> Deal.company`,
// so a quotation under a deal whose company this user OWNS counts as owned
// too — mirrors contactController's isOwnedByUser, swapping
// company/ownedCompanyIds for deal/ownedDealIds (via getOwnedDealIds).
// `ownedDealIds` is optional.
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

// Create Quotation
exports.createQuotation = async (req, res) => {
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
      transactionType,
      gstRate,
      signature,
      signatureType,
      discount,
      bankDetails,
      isRoundOff,
      receiverGSTIN,
      billingAddress,
      shippingAddress,
      quotationPrefix,
      quotationSuffix,
      quotationNumber: clientQuotationNumber,
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

    // Quotation number: Document Settings' configured prefix
    // (documentTypeSettings.quote.prefix) is the source of truth when the
    // client doesn't send one — previously this fell back to a hardcoded
    // "QUO-" that never matched what Settings actually said. Numbering is
    // scoped to the resolved prefix specifically, so switching prefixes
    // restarts (or resumes) cleanly instead of continuing another prefix's
    // sequence.
    const documentSettings = await getDocumentSettingsForOrganization(req.user.organization);
    const finalPrefix = (quotationPrefix && quotationPrefix.trim()) || documentSettings.documentTypeSettings?.quote?.prefix || "QT-";
    const finalSuffix = (quotationSuffix ?? documentSettings.documentTypeSettings?.quote?.suffix ?? "").toString().trim();
    let quotationNumber;
    try {
      quotationNumber = await resolveDocumentNumber({
        Model: Quotation,
        numberField: "quotationNumber",
        organization: req.user.organization,
        documentTypeKey: "quote",
        prefix: finalPrefix,
        suffix: finalSuffix,
        providedNumber: clientQuotationNumber && String(clientQuotationNumber).trim() ? clientQuotationNumber : null,
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
    let finalReceiverGSTIN = receiverGSTIN;

    if (dealDoc && dealDoc.company) {
      if (!finalBillingAddress || Object.keys(finalBillingAddress).length === 0) {
        finalBillingAddress = dealDoc.company.billingAddress || {};
      }
      if (!finalShippingAddress || Object.keys(finalShippingAddress).length === 0) {
        finalShippingAddress = dealDoc.company.shippingAddresses?.[0] || {};
      }
      if (!finalReceiverGSTIN) {
        finalReceiverGSTIN = dealDoc.company.gstin || "";
      }
    }

    const quotation = new Quotation({
      deal,
      quotationPrefix: finalPrefix,
      quotationNumber,
      reference: reference || "",
      date,
      dueDate,
      amount,
      status,
      items,
      notes: notes || "",
      terms: terms || "",
      transactionType: transactionType || "intra",
      gstRate: gstRate || 18,
      signature,
      signatureType: signatureType || "text",
      discount: discount || { type: "fixed", value: 0 },
      // Bank account chosen on the form; the PDF prints it (utils/resolveBankDetails.js).
      bankDetails: bankDetails || null,
      ...(isRoundOff !== undefined && { isRoundOff: !!isRoundOff }),
      receiverGSTIN: finalReceiverGSTIN,
      billingAddress: finalBillingAddress,
      shippingAddress: finalShippingAddress,
      user: req.user.id,
      organization: req.user.organization,
    });

    await quotation.save({ session });
    await session.commitTransaction();
    session.endSession();

    res.status(201).json(quotation);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res
      .status(500)
      .json({ error: `Failed to create quotation: ${err.message}` });
  }
};

// Duplicate: clones an existing quotation into a brand-new Draft quotation
// with a freshly generated number. Does not touch the source quotation.
exports.duplicateQuotation = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const source = await Quotation.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    }).session(session);

    if (!source) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Quotation not found" });
    }

    const documentSettings = await getDocumentSettingsForOrganization(req.user.organization);
    const finalPrefix = documentSettings.documentTypeSettings?.quote?.prefix || "QT-";
    const finalSuffix = (documentSettings.documentTypeSettings?.quote?.suffix ?? "").toString().trim();

    let newQuotationNumber;
    try {
      newQuotationNumber = await resolveDocumentNumber({
        Model: Quotation,
        numberField: "quotationNumber",
        organization: req.user.organization,
        documentTypeKey: "quote",
        prefix: finalPrefix,
        suffix: finalSuffix,
        providedNumber: null,
        session,
      });
    } catch (numErr) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: numErr.message });
    }

    // Bulk signature updates write via updateMany (no schema validation), so
    // older quotations can carry a signatureType like "image" that the
    // ['text','upload'] enum never actually allowed. A new document's .save()
    // does validate, so that stale value must be normalized here rather than
    // copied straight through.
    const validSignatureTypes = ["text", "upload"];
    const normalizedSignatureType = validSignatureTypes.includes(source.signatureType)
      ? source.signatureType
      : (source.signature ? "upload" : "text");

    const duplicate = new Quotation({
      deal: source.deal,
      quotationPrefix: finalPrefix,
      quotationNumber: newQuotationNumber,
      reference: source.reference,
      date: new Date(),
      amount: source.amount,
      status: "Draft",
      items: source.items,
      notes: source.notes,
      terms: source.terms,
      isRoundOff: source.isRoundOff,
      transactionType: source.transactionType,
      gstRate: source.gstRate,
      signature: source.signature,
      signatureType: normalizedSignatureType,
      discount: source.discount,
      bankDetails: source.bankDetails || null,
      receiverGSTIN: source.receiverGSTIN,
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
    res.status(500).json({ error: `Failed to duplicate quotation: ${err.message}` });
  }
};

// Get All Quotations
exports.getAllQuotations = async (req, res) => {
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
          { quotationNumber: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { deal: { $in: matchingDeals.map((d) => d._id) } },
          { receiverGSTIN: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        ],
      });
    }

    if (andConditions.length > 0) {
      query.$and = andConditions;
    }

    const quotations = await Quotation.find(query).populate("deal");
    res.json(quotations);
  } catch (error) {
    res
      .status(500)
      .json({ message: `Failed to fetch quotations: ${error.message}` });
  }
};

// Get All Quotations Paginated
exports.getAllQuotationsPaginated = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;
    const {
      search,
      status,
      sortBy = "quotationNumber",
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
          { quotationNumber: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { status: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
          { deal: { $in: matchingDeals.map((d) => d._id) } },
          { receiverGSTIN: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
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

    const [quotations, totalCount] = await Promise.all([
      Quotation.find(query)
        .populate("deal")
        .skip(skip)
        .limit(limit)
        .sort(sortObj)
        .lean()
        .select("-__v"),
      Quotation.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      quotations,
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
      .json({ error: `Failed to fetch quotations: ${error.message}` });
  }
};

// Download Quotation
exports.downloadQuotation = async (req, res) => {
  try {
    const quotation = await Quotation.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    })
      .populate({
        path: "deal",
        populate: ["contact", "company"],
      })
      .populate("items.itemId");

    if (!quotation) {
      return res.status(404).json({ error: "Quotation not found" });
    }

    const bankDetails = await resolveBankDetails(quotation, req.user.organization);
    const orgDetails = await Branding.findOne({
      organization: req.user.organization,
    }).sort({ updatedAt: -1 });

    // The template is resolved from the organization's document settings
    // inside htmlDocumentPdf, which renders the same markup as the live preview.
    const copyType = ["original", "duplicate", "triplicate"].includes(req.query.copyType)
      ? req.query.copyType
      : "original";
    const pdfBuffer = await htmlDocumentPdf(quotation, bankDetails, orgDetails, "quotation", copyType);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=quotation-${quotation.quotationNumber}.pdf`,
    });
    return res.send(pdfBuffer);
  } catch (err) {
    res
      .status(500)
      .json({ error: `Failed to download quotation: ${err.message}` });
  }
};

// Delete Quotation
exports.deleteQuotation = async (req, res) => {
  try {
    const quotation = await Quotation.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });

    if (!quotation) {
      return res.status(404).json({ error: "Quotation not found" });
    }

    if (req.ownOnly) {
      const ownedDealIds = await getOwnedDealIds(req.user._id, req.user.organization);
      if (!isOwnedByUser(quotation, req.user._id, ownedDealIds)) {
        return res.status(403).json({ error: "You can only delete quotations you own" });
      }
    }

    await quotation.deleteOne();
    res.json({ message: "Quotation deleted successfully" });
  } catch (err) {
    res
      .status(500)
      .json({ error: `Failed to delete quotation: ${err.message}` });
  }
};

// Update Quotation
exports.updateQuotation = async (req, res) => {
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
      transactionType,
      gstRate,
      signature,
      signatureType,
      discount,
      bankDetails,
      isRoundOff,
      receiverGSTIN,
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
    let finalReceiverGSTIN = receiverGSTIN;

    if (dealDoc && dealDoc.company) {
      if (!finalBillingAddress || Object.keys(finalBillingAddress).length === 0) {
        finalBillingAddress = dealDoc.company.billingAddress || {};
      }
      if (!finalShippingAddress || Object.keys(finalShippingAddress).length === 0) {
        finalShippingAddress = dealDoc.company.shippingAddresses?.[0] || {};
      }
      if (!finalReceiverGSTIN) {
        finalReceiverGSTIN = dealDoc.company.gstin || "";
      }
    }

    if (req.ownOnly) {
      const existing = await Quotation.findOne({
        _id: req.params.id,
        organization: req.user.organization,
      });
      if (!existing) {
        return res.status(404).json({ error: "Quotation not found" });
      }
      const ownedDealIds = await getOwnedDealIds(req.user._id, req.user.organization);
      if (!isOwnedByUser(existing, req.user._id, ownedDealIds)) {
        return res.status(403).json({ error: "You can only edit quotations you own" });
      }
    }

    const quotation = await Quotation.findOneAndUpdate(
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
        transactionType,
        gstRate,
        signature,
        signatureType,
        discount,
        // Only written when sent, so an update without them leaves the saved values alone.
        ...(bankDetails !== undefined && { bankDetails: bankDetails || null }),
        ...(isRoundOff !== undefined && { isRoundOff: !!isRoundOff }),
        receiverGSTIN: finalReceiverGSTIN,
        billingAddress: finalBillingAddress,
        shippingAddress: finalShippingAddress,
        reference: reference || "",
      },
      { new: true }
    );

    if (!quotation) {
      return res.status(404).json({ error: "Quotation not found" });
    }

    res.json({ message: "Quotation updated successfully", quotation });
  } catch (err) {
    res
      .status(500)
      .json({ error: `Failed to update quotation: ${err.message}` });
  }
};

// Update Quotation Status
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    const quotation = await Quotation.findOneAndUpdate(
      { _id: req.params.id, organization: req.user.organization },
      { status },
      { new: true }
    );

    if (!quotation) {
      return res.status(404).json({ error: "Quotation not found" });
    }

    res.json({ message: "Quotation status updated successfully", quotation });
  } catch (err) {
    res
      .status(500)
      .json({ error: `Failed to update quotation status: ${err.message}` });
  }
};

// Send Quotation Email
exports.sendQuotationEmail = async (req, res) => {
  try {
    const quotation = await Quotation.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    })
      .populate({
        path: "deal",
        populate: ["contact", "company"],
      })
      .populate("items.itemId");

    if (!quotation) {
      return res.status(404).json({ error: "Quotation not found" });
    }

    const bankDetails = await resolveBankDetails(quotation, req.user.organization);
    const orgDetails = await Branding.findOne({
      organization: req.user.organization,
    }).sort({ updatedAt: -1 });

    // The template is resolved from the organization's document settings
    // inside htmlDocumentPdf, which renders the same markup as the live preview.
    const pdfBuffer = await htmlDocumentPdf(quotation, bankDetails, orgDetails, "quotation");

    const companyName = orgDetails?.companyName || "";
    const contactName = quotation.deal.contactPerson || "Sir/Madam";
    const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "");
    const fmtAmt = (n) => (Number.isFinite(Number(n)) ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(Number(n)) : "");
    const issueDate = fmtDate(quotation.date);
    const totalAmt = fmtAmt(quotation.amount);
    const validUntil = fmtDate(quotation.dueDate);

    const senderName = companyName || "The sender";
    const bodyLines = [
      `Hello ${contactName},`,
      "",
      `Please find attached quotation ${quotation.quotationNumber}${issueDate ? `, dated ${issueDate}` : ""}${totalAmt ? `, for a total of ${totalAmt}` : ""}.`,
      validUntil ? `This quotation is valid until ${validUntil}.` : "",
      "Let us know if you would like any changes.",
      "",
      "Regards,",
      senderName,
    ].filter((line, i, arr) => !(line === "" && arr[i - 1] === ""));

    const mailOptions = {
      to: quotation.deal.email || req.body.email,
      replyTo: req.user.email,
      subject: `Quotation ${quotation.quotationNumber}${companyName ? ` from ${companyName}` : ""}`,
      text: bodyLines.join("\n"),
      html: renderEmail({
        greetingName: contactName,
        intro: [
          `Please find attached quotation ${quotation.quotationNumber}${issueDate ? `, dated ${issueDate}` : ""}${totalAmt ? `, for a total of ${totalAmt}` : ""}.`,
          validUntil ? `This quotation is valid until ${validUntil}.` : "",
          "Let us know if you would like any changes.",
        ].filter(Boolean),
        blocks: [{ rows: [
          { label: "Quotation", value: quotation.quotationNumber },
          issueDate ? { label: "Date", value: issueDate } : null,
          totalAmt ? { label: "Total", value: totalAmt } : null,
          validUntil ? { label: "Valid until", value: validUntil } : null,
        ].filter(Boolean) }],
        signOff: senderName,
        preheader: `Quotation ${quotation.quotationNumber} from ${senderName}`,
      }),
      attachments: [
        {
          filename: `Quotation-${quotation.quotationNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    };

    await sendGridMail(mailOptions);
    quotation.status = "Sent";
    await quotation.save();

    res.json({ message: "Quotation emailed successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ error: `Failed to send quotation email: ${error.message}` });
  }
};

// Update Quotation Number (Rename QUO-XXX)
exports.updateQuotationNumber = async (req, res) => {
  try {
    const { quotationNumber } = req.body;
    const quotationId = req.params.id;

    // Validate input
    if (
      !quotationNumber ||
      typeof quotationNumber !== "string" ||
      quotationNumber.trim() === ""
    ) {
      return res.status(400).json({ error: "quotationNumber is required" });
    }

    const newNumber = quotationNumber.trim().toUpperCase();

    // Prevent duplicates inside same organization
    const existing = await Quotation.findOne({
      quotationNumber: newNumber,
      organization: req.user.organization,
      _id: { $ne: quotationId },
    });

    if (existing) {
      return res.status(409).json({ error: "Quotation number already exists" });
    }

    // Update
    const updatedQuotation = await Quotation.findOneAndUpdate(
      {
        _id: quotationId,
        organization: req.user.organization,
      },
      { quotationNumber: newNumber },
      { new: true }
    );

    if (!updatedQuotation) {
      return res.status(404).json({ error: "Quotation not found" });
    }

    return res.json({
      message: "Quotation number updated successfully",
      quotation: updatedQuotation,
    });
  } catch (err) {
    console.error("updateQuotationNumber error:", err);
    return res.status(500).json({ error: err.message });
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
        Quotation.findOneAndUpdate(
          { _id: id, organization: req.user.organization },
          { status }
        )
      )
    );
    res.json({ message: `Updated ${ids.length} quotations to status: ${status}` });
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
    const quotations = await Quotation.find({ _id: { $in: ids }, organization: req.user.organization }, '_id');
    const validIds = quotations.map(q => q._id.toString());
    const failedIds = ids.filter(id => !validIds.includes(id));
    
    if (validIds.length > 0) {
      // Per-record findOneAndUpdate (not updateMany) so each quotation gets
      // its own properly-labelled notification instead of one garbled entry
      // for the whole `$in` filter.
      await Promise.all(
        validIds.map((id) =>
          Quotation.findOneAndUpdate(
            { _id: id },
            { signature: signature || "", signatureType: signatureType || "text" }
          )
        )
      );
    }
    
    res.json({
      message: `Updated signature for ${validIds.length} quotations`,
      successfulIds: validIds,
      failedIds
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
