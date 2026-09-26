const Payment = require("../models/Payment");
const Vendor = require("../models/Vendor");
const Invoice = require("../models/Invoice");
const Purchase = require("../models/Purchase");
const SubscriptionPayment = require("../models/SubscriptionPayment.js");
const BankDetails = require("../models/BankDetails");
const Wallet = require("../models/Wallet");
const Company = require("../models/Company");
const Contact = require("../models/Contact");
const Deal = require("../models/Deal");
const PaymentAllocation = require("../models/PaymentAllocation");
const Expense = require("../models/Expense");
const allocationService = require("../services/paymentAllocationService");

exports.getPaymentsTimeline = async (req, res) => {
  try {
    const orgId = req.user.organization;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const partyFilter = req.query.party ? req.query.party.trim().toLowerCase() : "";
    const typeFilter = req.query.type ? req.query.type.trim() : "";
    const directionFilter = req.query.direction ? req.query.direction.trim().toUpperCase() : "";
    const searchQuery = req.query.search ? req.query.search.trim().toLowerCase() : "";

    let rules = [];
    if (req.query.rules) {
      try {
        rules = JSON.parse(req.query.rules);
      } catch (e) {
        rules = [];
      }
    }

    // Fetch from all relevant collections concurrently
    const [payments, invoices, purchases, subPayments, bankAccounts, wallet, allocations, expenses] = await Promise.all([
      Payment.find({ organization: orgId })
        .populate("vendor", "name companyName")
        .populate("party", "name companyName"),
      Invoice.find({ organization: orgId }).populate({
        path: "deal",
        populate: [
          { path: "company", select: "name" },
          { path: "contact", select: "name" }
        ]
      }),
      Purchase.find({ organization: orgId }).populate("vendor", "name companyName"),
      SubscriptionPayment.find({ organization: orgId }),
      BankDetails.find({ organization: orgId }),
      Wallet.findOne({ organization: orgId }),
      PaymentAllocation.find({ organization: orgId }).select("documentPaymentId").lean(),
      // Only settled entries — a Pending expense is a record of something
      // owed, not money that has moved, and the timeline is strictly actual
      // cash (same rule the invoice/purchase rows follow).
      Expense.find({ organization: orgId, status: "Paid" })
        .populate("bankAccount", "bank accountNumber")
        .populate("vendor", "name companyName")
        .lean()
    ]);

    // The timeline reads both the Payment collection and the subdocs those
    // payments pushed, so the subdocs are skipped to avoid double-counting.
    // The Payment row is canonical — it carries the party and the full split.
    const allocatedSubdocIds = new Set(
      allocations.filter((a) => a.documentPaymentId).map((a) => String(a.documentPaymentId))
    );

    // Buckets a payment method onto an account card. Bank cards match by bank
    // NAME, so electronic methods leave it blank rather than guessing a card.
    const methodToBank = (method) => {
      if (!method) return "";
      if (method === "Cash") return "Cash";
      // UPI, NEFT, RTGS, IMPS, Cheque, Card, Net Banking, EMI, TDS, Other
      // → generic electronic; leave blank so it counts in the aggregate
      // Credit/Debit/Net totals but not inside any named bank card.
      return "";
    };

    // paymentDate was historically stored date-only (UTC-midnight, which reads
    // as 05:30 IST and leaves ties unsortable). createdAt always holds the real
    // recording instant, so fall back to it when paymentDate carries no time.
    const recordedAt = (paymentDate, createdAt) => {
      if (!paymentDate) return createdAt || paymentDate;
      const pd = new Date(paymentDate);
      const isDateOnly =
        pd.getUTCHours() === 0 &&
        pd.getUTCMinutes() === 0 &&
        pd.getUTCSeconds() === 0 &&
        pd.getUTCMilliseconds() === 0;
      return isDateOnly && createdAt ? createdAt : paymentDate;
    };

    const formattedPayments = payments.map((p) => {
      // `party` is the general pointer (Vendor for Debit, Company/Contact for
      // Credit); `vendor` is the legacy one every pre-allocation row still
      // uses. Prefer party, fall back to vendor.
      const partyDoc = p.party || p.vendor;
      const partyName = partyDoc
        ? partyDoc.companyName || partyDoc.name
        : (p.direction === "IN" ? "Unknown Customer" : "Unknown Vendor");

      const allocated = Number(p.allocatedAmount) || 0;
      const unallocated = Math.max(0, (Number(p.amount) || 0) - allocated);

      return {
        _id: p._id,
        "payment-id": p._id.toString().substring(0, 8).toUpperCase(),
        party: partyName,
        partyType: p.partyType || (p.vendor ? "Vendor" : null),
        partyId: partyDoc ? partyDoc._id || partyDoc : null,
        amount: p.amount,
        // Surfaced on the row so the timeline can show "₹2,000 unapplied"
        // without a second request per payment.
        allocatedAmount: allocated,
        unallocatedAmount: unallocated,
        direction: p.direction,
        type: p.paymentType || "Payment",
        date: recordedAt(p.paymentDate, p.createdAt),
        bank: p.bank || "",
        notes: p.notes || "",
        reference: p.reference || "",
        // Legacy rows predate the flag, so fall back to the note text the old
        // self-transfer path wrote — otherwise they keep inflating the KPIs.
        isInternalTransfer:
          p.isInternalTransfer === true || /^Self Transfer (to|from) /.test(p.notes || ""),
        transferGroup: p.transferGroup || null,
        source: "Payment",
        status: "Paid"
      };
    });

    // Actual payments only: one row per payments[] entry, not one per invoice.
    // An unpaid invoice produces no rows.
    const formattedInvoices = invoices.flatMap((inv) => {
      if (!inv.payments || inv.payments.length === 0) return [];

      let party = "Unknown Client";
      if (inv.deal) {
        if (inv.deal.company && inv.deal.company.name) party = inv.deal.company.name;
        else if (inv.deal.contact && inv.deal.contact.name) party = inv.deal.contact.name;
      }

      return inv.payments
        .filter((pmt) => !allocatedSubdocIds.has(String(pmt._id)))
        .map((pmt) => ({
        _id: pmt._id,
        "payment-id": inv.invoiceNumber
          ? `${inv.invoiceNumber}-P${pmt._id.toString().substring(0, 4).toUpperCase()}`
          : pmt._id.toString().substring(0, 8).toUpperCase(),
        party,
        amount: pmt.amount,
        direction: "IN",
        type: pmt.paymentMethod || "Invoice Payment",
        date: pmt.paymentDate || inv.date || inv.createdAt,
        bank: methodToBank(pmt.paymentMethod),
        notes: pmt.notes || inv.notes || "",
        reference: pmt.reference || inv.invoiceNumber || "",
        source: "Invoice",
        status: "Paid",
        parentId: inv._id,
        parentNumber: inv.invoiceNumber,
      }));
    });

    // STRICTLY ACTUAL PAYMENTS ONLY — iterate each Purchase's payments[]
    // sub-array instead of mapping the whole purchase as a single cash-out.
    // Unpaid purchases produce ZERO rows here.
    const formattedPurchases = purchases.flatMap((pur) => {
      if (!pur.payments || pur.payments.length === 0) return [];

      const vendorName = pur.vendor
        ? pur.vendor.companyName || pur.vendor.name
        : "Unknown Vendor";

      return pur.payments
        .filter((pmt) => !allocatedSubdocIds.has(String(pmt._id)))
        .map((pmt) => ({
        _id: pmt._id,
        "payment-id": pur.purchaseNumber
          ? `${pur.purchaseNumber}-P${pmt._id.toString().substring(0, 4).toUpperCase()}`
          : pmt._id.toString().substring(0, 8).toUpperCase(),
        party: vendorName,
        amount: pmt.amount,
        direction: "OUT",
        type: pmt.paymentMethod || "Purchase Payment",
        date: pmt.paymentDate || pur.purchaseDate || pur.createdAt,
        bank: methodToBank(pmt.paymentMethod),
        notes: pmt.notes || pur.notes || "",
        reference: pmt.reference || pur.purchaseNumber || "",
        source: "Purchase",
        status: "Paid",
        parentId: pur._id,
        parentNumber: pur.purchaseNumber,
      }));
    });

    const formattedSubs = subPayments.map((sub) => ({
      _id: sub._id,
      "payment-id": sub.razorpayPaymentId || sub._id.toString().substring(0, 8).toUpperCase(),
      party: "DataCircles System",
      amount: sub.amount,
      direction: "OUT",
      type: sub.method || "Subscription",
      date: sub.createdAt,
      bank: "",
      notes: sub.paymentFor || "",
      source: "Subscription",
      status: sub.status
    }));

    // Expenses and Indirect Income settle no document, so they skip the
    // allocation engine — but they're real cash and belong in the totals.
    const formattedExpenses = expenses.map((e) => {
      const isIncome = e.kind === "income";
      // Account cards match by bank NAME. Cash has no bank record, so it's
      // tagged by method instead.
      const bankTag = e.bankAccount?.bank
        ? e.bankAccount.bank
        : e.paymentType === "Cash"
          ? "Cash"
          : "";

      return {
        _id: e._id,
        // Last 6 chars, not the first: an ObjectId begins with a timestamp,
        // so entries created in the same second share a prefix and every row
        // would show the same id. The tail is the counter/random portion.
        "payment-id": `${isIncome ? "INC" : "EXP"}-${e._id.toString().slice(-6).toUpperCase()}`,
        // The vendor when one was attached; otherwise the category stands in
        // for a party, since most of these entries have no counterparty.
        party:
          e.vendor?.companyName ||
          e.vendor?.name ||
          e.category ||
          (isIncome ? "Indirect Income" : "Expense"),
        amount: e.amount,
        direction: isIncome ? "IN" : "OUT",
        type: e.paymentType || (isIncome ? "Income" : "Expense"),
        date: e.paymentDate || e.date || e.createdAt,
        bank: bankTag,
        notes: e.notes || e.paymentNotes || "",
        reference: e.category || "",
        source: isIncome ? "Indirect Income" : "Expense",
        status: "Paid",
      };
    });

    let allTransactions = [
      ...formattedPayments,
      ...formattedInvoices,
      ...formattedPurchases,
      ...formattedSubs,
      ...formattedExpenses
    ];

    if (partyFilter) {
      allTransactions = allTransactions.filter(t => (t.party || "").toLowerCase().includes(partyFilter));
    }

    if (searchQuery) {
      allTransactions = allTransactions.filter(t =>
        (t["payment-id"] || "").toLowerCase().includes(searchQuery) ||
        (t.party || "").toLowerCase().includes(searchQuery)
      );
    }

    if (directionFilter) {
      if (directionFilter === "CREDIT" || directionFilter === "IN") {
        allTransactions = allTransactions.filter(t => t.direction === "IN");
      } else if (directionFilter === "DEBIT" || directionFilter === "OUT") {
        allTransactions = allTransactions.filter(t => t.direction === "OUT");
      }
    }

    if (typeFilter) {
      if (typeFilter === "Credit") {
        allTransactions = allTransactions.filter(t => t.direction === "IN");
      } else if (typeFilter === "Debit") {
        allTransactions = allTransactions.filter(t => t.direction === "OUT");
      } else if (["Invoice", "Purchase", "Subscription", "Payment", "Expense", "Indirect Income"].includes(typeFilter)) {
        allTransactions = allTransactions.filter(t => (t.source || "").toLowerCase() === typeFilter.toLowerCase());
      }
    }

    // Apply Advanced Filter Rules
    if (Array.isArray(rules) && rules.length > 0) {
      allTransactions = allTransactions.filter(t => {
        return rules.every(rule => {
          if (!rule.column) return true;
          let colVal = t[rule.column];

          // Handle direction mapping for Credit/Debit
          if (rule.column === "direction") {
            colVal = t.direction === "IN" ? "Credit" : "Debit";
          }

          const op = rule.operator || "contains";
          const val = rule.value != null ? String(rule.value).trim().toLowerCase() : "";

          if (op === "is_empty") return colVal == null || String(colVal).trim() === "";
          if (op === "is_not_empty") return colVal != null && String(colVal).trim() !== "";

          if (rule.column === "amount") {
            const numT = Number(t.amount) || 0;
            const numV = Number(rule.value) || 0;
            if (op === "greater_than") return numT > numV;
            if (op === "less_than") return numT < numV;
            if (op === "is") return numT === numV;
            if (op === "is_not") return numT !== numV;
          }

          const strVal = colVal != null ? String(colVal).toLowerCase() : "";

          if (op === "contains") return strVal.includes(val);
          if (op === "not_contains") return !strVal.includes(val);
          if (op === "is") return strVal === val;
          if (op === "is_not") return strVal !== val;
          if (op === "greater_than") return Number(strVal) > Number(val);
          if (op === "less_than") return Number(strVal) < Number(val);
          if (op === "in") {
            const parts = val.split(",").map(p => p.trim());
            return parts.includes(strVal);
          }
          if (op === "not_in") {
            const parts = val.split(",").map(p => p.trim());
            return !parts.includes(strVal);
          }

          return true;
        });
      });
    }

    allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Manual Pagination
    const totalCount = allTransactions.length;
    const totalPages = Math.ceil(totalCount / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedTransactions = allTransactions.slice(startIndex, endIndex);

    // KPI totals over every matching transaction, not just the page slice.
    // Internal transfers are excluded — both legs are the same money, so
    // counting them inflates Credit and Debit. They stay in allTransactions,
    // so they still appear in the table and move the per-account balances.
    let totalCredit = 0;
    let totalDebit = 0;
    let totalTransferred = 0;
    allTransactions.forEach((t) => {
      const amt = Number(t.amount) || 0;
      if (t.isInternalTransfer) {
        // Counted once per transfer, not once per leg.
        if (t.direction === "OUT") totalTransferred += amt;
        return;
      }
      if (t.direction === "IN") totalCredit += amt;
      else totalDebit += amt;
    });

    // Compute account balances (Wallet + Banks)
    // 1. Bank balances: opening balance + sum(IN) - sum(OUT) for payments assigned to that bank
    const bankSummaries = bankAccounts.map((b) => {
      const bankName = b.bank || "Bank Account";
      const accNumber = b.accountNumber ? `•••• ${b.accountNumber.slice(-4)}` : "";
      const opening = Number(b.openingBalance) || 0;

      // Filter all transactions linked to this bank
      const bankTx = allTransactions.filter((t) => {
        if (!t.bank) return false;
        const bName = t.bank.toLowerCase();
        return bName.includes(bankName.toLowerCase()) || bName.includes((b.accountNumber || "").toLowerCase());
      });

      const inSum = bankTx.filter((t) => t.direction === "IN").reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
      const outSum = bankTx.filter((t) => t.direction === "OUT").reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
      const currentBalance = opening + inSum - outSum;

      return {
        id: b._id,
        type: "bank",
        title: bankName,
        accountNumber: accNumber,
        accountHolder: b.accountHolder || "",
        openingBalance: opening,
        currentBalance,
        isDefault: b.isDefault || false
      };
    });

    // 2. Wallet balance
    const walletBalance = wallet ? Number(wallet.balance) || 0 : 0;
    const walletSummary = {
      id: wallet ? wallet._id : "wallet-card",
      type: "wallet",
      title: "DataCircles Wallet",
      accountNumber: "Prepaid Credits",
      currentBalance: walletBalance,
      credits: wallet ? wallet.credits || 0 : 0
    };

    // 3. Cash balance: all transactions across every source where the bank
    // tag is "Cash" — this now includes invoice payments and purchase payments
    // made by Cash method, not just standalone Payment records.
    const cashTxAll = allTransactions.filter((t) => t.bank === "Cash" || t.type === "Cash");
    const cashIn  = cashTxAll.filter((t) => t.direction === "IN" ).reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
    const cashOut = cashTxAll.filter((t) => t.direction === "OUT").reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
    const cashSummary = {
      id: "cash-card",
      type: "cash",
      title: "Cash",
      accountNumber: "Physical Cash",
      currentBalance: cashIn - cashOut,
    };

    const accountsSummary = [walletSummary, cashSummary, ...bankSummaries];

    res.json({
      documents: paginatedTransactions,
      accountsSummary,
      pagination: {
        currentPage: page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      summary: {
        totalCredit,
        totalDebit,
        net: totalCredit - totalDebit,
        // Money moved between the org's own accounts. Reported separately so
        // the figure isn't lost — it just isn't income or expense.
        totalTransferred,
        // Still every row in the table, transfers included, so this matches
        // what the user can actually count on screen.
        count: totalCount
      }
    });
  } catch (err) {
    console.error("Fetch payments timeline error:", err);
    res.status(500).json({ error: "Failed to fetch unified payments timeline" });
  }
};

// Backs the "View" action: the full record plus its party, normalized into the
// one receipt shape PaymentReceiptModal expects for every timeline source.
exports.getPaymentReceipt = async (req, res) => {
  try {
    const orgId = req.user.organization;
    const { id } = req.params;
    const source = (req.query.source || "").trim();

    if (source === "Payment") {
      const payment = await Payment.findOne({ _id: id, organization: orgId }).populate("vendor");
      if (!payment) return res.status(404).json({ error: "Payment not found" });
      return res.json({ payment, vendor: payment.vendor });
    }

    if (source === "Purchase") {
      const purchase = await Purchase.findOne({ _id: id, organization: orgId }).populate("vendor");
      if (!purchase) return res.status(404).json({ error: "Purchase not found" });
      // Normalized onto the same field names PaymentReceiptModal reads from a
      // real Payment document, so the modal doesn't need to know the source.
      const payment = {
        _id: purchase._id,
        amount: purchase.grandTotal || purchase.subtotal,
        paymentDate: purchase.purchaseDate || purchase.createdAt,
        direction: "OUT",
        paymentType: "Purchase",
        bank: "",
        notes: purchase.notes || "",
      };
      return res.json({ payment, vendor: purchase.vendor });
    }

    if (source === "Invoice") {
      const invoice = await Invoice.findOne({ _id: id, organization: orgId })
        .populate({ path: "deal", populate: ["contact", "company"] });
      if (!invoice) return res.status(404).json({ error: "Invoice not found" });

      const party = invoice.deal?.company || invoice.deal?.contact || {
        name: invoice.deal?.title || "Customer",
      };
      const payment = {
        _id: invoice._id,
        amount: invoice.amount,
        paymentDate: invoice.date || invoice.createdAt,
        direction: "IN",
        paymentType: "Invoice",
        bank: "",
        notes: invoice.notes || "",
        reference: invoice.invoiceNumber,
      };
      return res.json({ payment, vendor: party });
    }

    if (source === "Expense" || source === "Indirect Income") {
      const entry = await Expense.findOne({ _id: id, organization: orgId })
        .populate("bankAccount", "bank accountNumber")
        .populate("vendor", "name companyName")
        .lean();
      if (!entry) return res.status(404).json({ error: "Record not found" });

      // Normalized onto the field names PaymentReceiptModal reads from a real
      // Payment, so the modal doesn't need to know about this source.
      const payment = {
        _id: entry._id,
        amount: entry.amount,
        paymentDate: entry.paymentDate || entry.date,
        direction: entry.kind === "income" ? "IN" : "OUT",
        paymentType: entry.paymentType || (entry.kind === "income" ? "Income" : "Expense"),
        bank: entry.bankAccount?.bank || "",
        notes: entry.notes || entry.paymentNotes || "",
        reference: entry.category || "",
      };
      const party = entry.vendor || {
        name: entry.category || (entry.kind === "income" ? "Indirect Income" : "Expense"),
      };
      return res.json({ payment, vendor: party });
    }

    if (source === "Subscription") {
      const subscriptionPayment = await SubscriptionPayment.findOne({
        _id: id,
        organization: orgId,
      });
      if (!subscriptionPayment) return res.status(404).json({ error: "Subscription payment not found" });

      const payment = {
        _id: subscriptionPayment._id,
        amount: subscriptionPayment.amount,
        paymentDate: subscriptionPayment.createdAt,
        direction: "OUT",
        paymentType: subscriptionPayment.method || "Subscription",
        bank: "",
        notes: subscriptionPayment.paymentFor || "",
        reference: subscriptionPayment.razorpayPaymentId || "",
      };
      return res.json({
        payment,
        vendor: { name: "DataCircles", company: "DataCircles System" },
      });
    }

    return res.status(400).json({ error: `Receipts aren't available for "${source}" entries` });
  } catch (err) {
    console.error("Fetch payment receipt error:", err);
    res.status(500).json({ error: "Failed to fetch payment receipt" });
  }
};

// Who a payment of this direction can be attributed to: IN comes from a
// customer (the Company or Contact a Deal points at), OUT goes to a Vendor.
exports.getPaymentParties = async (req, res) => {
  try {
    const orgId = req.user.organization;
    const direction = (req.query.direction || "OUT").trim().toUpperCase();
    const search = (req.query.search || "").trim().toLowerCase();

    let parties = [];

    if (direction === "IN") {
      // Only parties that could actually have an invoice — i.e. ones with at
      // least one deal. Listing every company in the CRM would bury the
      // handful that can be paid against.
      const deals = await Deal.find({ organization: orgId })
        .select("company contact")
        .lean();

      const companyIds = [...new Set(deals.filter((d) => d.company).map((d) => String(d.company)))];
      const contactIds = [...new Set(deals.filter((d) => d.contact).map((d) => String(d.contact)))];

      const [companies, contacts] = await Promise.all([
        Company.find({ _id: { $in: companyIds }, organization: orgId })
          .select("name email phone")
          .lean(),
        Contact.find({ _id: { $in: contactIds }, organization: orgId })
          .select("name email phone")
          .lean(),
      ]);

      // Names repeat, so `subtitle` carries whatever tells two apart, falling
      // back to a short id.
      const subtitleFor = (c, type) =>
        c.email || c.phone || `${type} · ${String(c._id).slice(-6)}`;

      parties = [
        ...companies.map((c) => ({
          _id: c._id,
          partyType: "Company",
          name: c.name || "Unnamed company",
          subtitle: subtitleFor(c, "Company"),
        })),
        ...contacts.map((c) => ({
          _id: c._id,
          partyType: "Contact",
          name: c.name || "Unnamed contact",
          subtitle: subtitleFor(c, "Contact"),
        })),
      ];
    } else {
      const vendors = await Vendor.find({ organization: orgId })
        .select("name companyName email phone")
        .lean();
      parties = vendors.map((v) => ({
        _id: v._id,
        partyType: "Vendor",
        name: v.companyName || v.name || "Unnamed vendor",
        subtitle: v.email || v.phone || "",
      }));
    }

    if (search) {
      parties = parties.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          (p.subtitle || "").toLowerCase().includes(search)
      );
    }

    parties.sort((a, b) => a.name.localeCompare(b.name));

    res.json({ direction, parties });
  } catch (err) {
    console.error("Fetch payment parties error:", err);
    res.status(500).json({ error: "Failed to fetch parties" });
  }
};

// GET /api/payments-timeline/open-documents?direction&partyType&partyId
// The party's not-fully-settled documents, each with the balance it still
// owes — the list the allocation step splits an amount across.
exports.getOpenDocuments = async (req, res) => {
  try {
    const orgId = req.user.organization;
    const direction = (req.query.direction || "").trim().toUpperCase();
    const { partyType, partyId } = req.query;

    if (!["IN", "OUT"].includes(direction)) {
      return res.status(400).json({ error: "direction must be IN or OUT" });
    }
    if (!partyId) {
      return res.status(400).json({ error: "partyId is required" });
    }

    const result = await allocationService.getOpenDocuments({
      orgId,
      direction,
      partyType: partyType || (direction === "IN" ? "Company" : "Vendor"),
      partyId,
    });

    const totalDue = allocationService.round2(
      result.documents.reduce((sum, d) => sum + d.due, 0)
    );

    res.json({ ...result, totalDue });
  } catch (err) {
    console.error("Fetch open documents error:", err);
    res.status(500).json({ error: "Failed to fetch open documents" });
  }
};

// Every open document in the org with its party name — backs the "search any"
// picker, since credit isn't restricted to the party it came from.
exports.getAllOpenDocuments = async (req, res) => {
  try {
    const direction = (req.query.direction || "").trim().toUpperCase();
    if (!["IN", "OUT"].includes(direction)) {
      return res.status(400).json({ error: "direction must be IN or OUT" });
    }
    const result = await allocationService.getAllOpenDocuments({
      orgId: req.user.organization,
      direction,
    });
    res.json(result);
  } catch (err) {
    console.error("Fetch all open documents error:", err);
    res.status(500).json({ error: "Failed to fetch open documents" });
  }
};

// Unallocated money per party — a customer paid ahead, or an advance to a
// vendor. Either way it's spendable against a future document.
exports.getCreditBalances = async (req, res) => {
  try {
    const direction = req.query.direction ? req.query.direction.trim().toUpperCase() : null;
    const balances = await allocationService.getCreditBalances({
      orgId: req.user.organization,
      direction: ["IN", "OUT"].includes(direction) ? direction : null,
      partyType: req.query.partyType || null,
      partyId: req.query.partyId || null,
    });

    const total = allocationService.round2(
      balances.reduce((sum, b) => sum + b.creditBalance, 0)
    );

    res.json({ balances, total });
  } catch (err) {
    console.error("Fetch credit balances error:", err);
    res.status(500).json({ error: "Failed to fetch credit balances" });
  }
};

// Spends a party's credit against their open documents. Separate from the
// per-payment endpoint because credit can span several payments (drawn FIFO).
exports.applyCreditBalance = async (req, res) => {
  try {
    const { partyType, partyId, direction, allocations } = req.body;

    if (!partyId || !["Vendor", "Company", "Contact"].includes(partyType)) {
      return res.status(400).json({ error: "A valid party is required." });
    }
    if (!["IN", "OUT"].includes(direction)) {
      return res.status(400).json({ error: "direction must be IN or OUT" });
    }

    const result = await allocationService.applyCreditBalance({
      orgId: req.user.organization,
      userId: req.user._id,
      partyType,
      partyId,
      direction,
      allocations,
    });

    res.json({
      message: "Credit applied",
      totalApplied: result.totalApplied,
      remainingCredit: result.remainingCredit,
      allocations: result.applied,
    });
  } catch (err) {
    if (err instanceof allocationService.AllocationError) {
      return res.status(400).json({ error: err.message });
    }
    console.error("Apply credit balance error:", err);
    res.status(500).json({ error: "Failed to apply credit" });
  }
};

exports.createPayment = async (req, res) => {
  try {
    const {
      vendor, vendorName, amount, paymentDate, direction, paymentType, bank, notes,
      reference, partyType, party, allocations, isInternalTransfer, transferGroup,
    } = req.body;
    const orgId = req.user.organization;
    const userId = req.user._id;

    if (!amount || !paymentDate || !direction || !paymentType) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (!["IN", "OUT"].includes(direction)) {
      return res.status(400).json({ error: "direction must be IN or OUT" });
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "A valid payment amount greater than 0 is required." });
    }

    // IN comes from a customer, OUT goes to a vendor. An OUT sets both `vendor`
    // and `party` so callers reading the legacy pointer keep working.
    let resolvedPartyType = partyType;
    let resolvedPartyId = party;
    let vendorId = vendor;

    const internalTransfer = Boolean(isInternalTransfer);

    if (internalTransfer) {
      // A self-transfer has no counterparty but still needs a vendor pointer,
      // so reuse ONE placeholder per org instead of creating one per leg.
      const label = vendorName || "Self Transfer";
      let placeholder = await Vendor.findOne({ name: label, organization: orgId });
      if (!placeholder) {
        placeholder = await Vendor.create({ name: label, organization: orgId, user: userId });
      }
      vendorId = placeholder._id;
      resolvedPartyType = "Vendor";
      resolvedPartyId = vendorId;
    } else if (direction === "OUT" || resolvedPartyType === "Vendor") {
      if (!vendorId && resolvedPartyType === "Vendor") vendorId = resolvedPartyId;
      if (!vendorId && vendorName) {
        // Reuse an existing vendor with this name before creating one —
        // typing a name that's already on file used to mint a duplicate
        // vendor on every payment.
        const existing =
          (await Vendor.findOne({ name: vendorName, organization: orgId })) ||
          (await Vendor.findOne({ companyName: vendorName, organization: orgId }));
        if (existing) {
          vendorId = existing._id;
        } else {
          const newVendor = new Vendor({ name: vendorName, organization: orgId, user: userId });
          await newVendor.save();
          vendorId = newVendor._id;
        }
      }
      if (!vendorId) {
        return res.status(400).json({ error: "Vendor is required" });
      }
      resolvedPartyType = "Vendor";
      resolvedPartyId = vendorId;
    } else {
      if (!resolvedPartyId || !["Company", "Contact"].includes(resolvedPartyType)) {
        return res.status(400).json({ error: "A customer (company or contact) is required for a Credit payment." });
      }
      const PartyModel = resolvedPartyType === "Company" ? Company : Contact;
      const exists = await PartyModel.exists({ _id: resolvedPartyId, organization: orgId });
      if (!exists) {
        return res.status(404).json({ error: "Customer not found" });
      }
    }

    const payment = new Payment({
      vendor: vendorId,
      partyType: resolvedPartyType,
      party: resolvedPartyId,
      amount: parsedAmount,
      allocatedAmount: 0,
      paymentDate: new Date(paymentDate),
      direction, // "IN" or "OUT"
      paymentType,
      bank,
      notes,
      reference,
      isInternalTransfer: internalTransfer,
      transferGroup: internalTransfer ? transferGroup : undefined,
      organization: orgId,
      user: userId,
    });

    await payment.save();

    // Split it across the chosen documents. Anything left over stays on the
    // payment as this party's credit balance rather than being lost.
    let allocationResult = { allocations: [], totalAllocated: 0 };
    if (Array.isArray(allocations) && allocations.length > 0) {
      try {
        allocationResult = await allocationService.applyAllocations({
          orgId, userId, payment, allocations,
        });
      } catch (allocErr) {
        // The payment itself is meaningless without the split the user asked
        // for — don't leave a half-recorded receipt behind.
        await payment.deleteOne();
        if (allocErr instanceof allocationService.AllocationError) {
          return res.status(400).json({ error: allocErr.message });
        }
        throw allocErr;
      }
    }

    res.status(201).json({
      ...payment.toObject(),
      allocations: allocationResult.allocations,
      totalAllocated: allocationResult.totalAllocated,
      unallocatedAmount: allocationService.round2(parsedAmount - allocationResult.totalAllocated),
    });
  } catch (err) {
    console.error("Create payment error:", err);
    res.status(500).json({ error: "Failed to create payment" });
  }
};

// Spends a payment's leftover credit later, after it was already recorded.
// Same validation and writes as allocating at creation time.
exports.allocateExistingPayment = async (req, res) => {
  try {
    const orgId = req.user.organization;
    const { allocations } = req.body;

    if (!Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({ error: "At least one allocation is required." });
    }

    const payment = await Payment.findOne({ _id: req.params.id, organization: orgId });
    if (!payment) return res.status(404).json({ error: "Payment not found" });

    const available = allocationService.round2(
      (Number(payment.amount) || 0) - (Number(payment.allocatedAmount) || 0)
    );
    if (available <= 0.01) {
      return res.status(400).json({ error: "This payment has no unallocated balance left." });
    }

    const result = await allocationService.applyAllocations({
      orgId,
      userId: req.user._id,
      payment,
      allocations,
    });

    res.json({
      message: "Allocation recorded",
      payment,
      allocations: result.allocations,
      unallocatedAmount: allocationService.round2(payment.amount - payment.allocatedAmount),
    });
  } catch (err) {
    if (err instanceof allocationService.AllocationError) {
      return res.status(400).json({ error: err.message });
    }
    console.error("Allocate payment error:", err);
    res.status(500).json({ error: "Failed to allocate payment" });
  }
};

// GET /api/payments-timeline/:id/allocations — what a payment settled.
exports.getPaymentAllocations = async (req, res) => {
  try {
    const orgId = req.user.organization;
    const payment = await Payment.findOne({ _id: req.params.id, organization: orgId }).lean();
    if (!payment) return res.status(404).json({ error: "Payment not found" });

    const records = await PaymentAllocation.find({ payment: payment._id, organization: orgId }).lean();

    // Allocation rows only carry the document id, so resolve each one's
    // human-readable number for display.
    const detailed = await Promise.all(
      records.map(async (r) => {
        const cfg = allocationService.DOC_CONFIG[r.documentType];
        const doc = cfg ? await cfg.model.findById(r.document).lean() : null;
        return {
          ...r,
          documentNumber: doc ? cfg.numberOf(doc) : "",
          documentTotal: doc ? allocationService.round2(cfg.totalOf(doc)) : 0,
          documentDue: doc
            ? allocationService.round2(cfg.totalOf(doc) - allocationService.sumPayments(doc.payments))
            : 0,
        };
      })
    );

    res.json({
      allocations: detailed,
      amount: allocationService.round2(payment.amount),
      allocatedAmount: allocationService.round2(payment.allocatedAmount),
      unallocatedAmount: allocationService.round2(
        (payment.amount || 0) - (payment.allocatedAmount || 0)
      ),
    });
  } catch (err) {
    console.error("Fetch payment allocations error:", err);
    res.status(500).json({ error: "Failed to fetch allocations" });
  }
};

// DELETE /api/payments-timeline/:id/allocations/:allocationId
// Un-settles one line, returning that balance to the document's outstanding
// amount and to the payment's credit balance.
exports.deleteAllocation = async (req, res) => {
  try {
    const orgId = req.user.organization;
    const record = await PaymentAllocation.findOne({
      _id: req.params.allocationId,
      payment: req.params.id,
      organization: orgId,
    });
    if (!record) return res.status(404).json({ error: "Allocation not found" });

    const payment = await Payment.findOne({ _id: req.params.id, organization: orgId });
    const amount = record.amount;

    await allocationService.reverseAllocation(record);

    if (payment) {
      payment.allocatedAmount = Math.max(
        0,
        allocationService.round2((Number(payment.allocatedAmount) || 0) - amount)
      );
      await payment.save({ validateModifiedOnly: true });
    }

    res.json({ message: "Allocation removed", released: amount });
  } catch (err) {
    console.error("Delete allocation error:", err);
    res.status(500).json({ error: "Failed to remove allocation" });
  }
};

exports.updateTimelineEntry = async (req, res) => {
  try {
    const orgId = req.user.organization;
    const { id } = req.params;
    const { source, vendor, vendorName, paymentDate, direction, paymentType, bank, notes } = req.body;

    if (!source) {
      return res.status(400).json({ error: "Missing 'source' parameter" });
    }

    let Model;
    switch (source) {
      case "Payment":      Model = Payment; break;
      case "Invoice":       Model = Invoice; break;
      case "Purchase":      Model = Purchase; break;
      case "Subscription":  Model = SubscriptionPayment; break;
      default:
        return res.status(400).json({ error: `Unknown source: ${source}` });
    }

    const doc = await Model.findOne({ _id: id, organization: orgId });
    if (!doc) {
      return res.status(404).json({ error: "Document not found or not authorized" });
    }

    // Resolve vendor if changing vendor
    let vendorId = vendor;
    if (!vendorId && vendorName) {
      const newVendor = new Vendor({
        name: vendorName,
        organization: orgId,
        user: req.user._id,
      });
      await newVendor.save();
      vendorId = newVendor._id;
    }

    if (source === "Payment") {
      if (vendorId) doc.vendor = vendorId;
      if (paymentDate) doc.paymentDate = new Date(paymentDate);
      if (direction) doc.direction = direction;
      if (paymentType) doc.paymentType = paymentType;
      if (bank !== undefined) doc.bank = bank;
      if (notes !== undefined) doc.notes = notes;
    } else {
      // Generic fallback fields update across models
      if (paymentDate) {
        if (doc.date !== undefined) doc.date = new Date(paymentDate);
        if (doc.paymentDate !== undefined) doc.paymentDate = new Date(paymentDate);
        if (doc.issueDate !== undefined) doc.issueDate = new Date(paymentDate);
      }
      if (notes !== undefined) doc.notes = notes;
      if (bank !== undefined) doc.bank = bank;
    }

    await doc.save();
    res.json({ message: "Updated successfully", doc });
  } catch (err) {
    console.error("Update timeline entry error:", err);
    res.status(500).json({ error: "Failed to update entry" });
  }
};

exports.deleteTimelineEntry = async (req, res) => {
  try {
    const orgId = req.user.organization;
    const { id } = req.params;
    const source = (req.query.source || "").trim();

    if (!source) {
      return res.status(400).json({ error: "Missing 'source' query parameter" });
    }

    let Model;
    switch (source) {
      case "Payment":      Model = Payment; break;
      case "Invoice":       Model = Invoice; break;
      case "Purchase":      Model = Purchase; break;
      case "Subscription":  Model = SubscriptionPayment; break;
      // Standalone ledger entries — no allocations to unwind, so deleting one
      // simply removes it (and with it, its effect on the account balances).
      case "Expense":
      case "Indirect Income": Model = Expense; break;
      default:
        return res.status(400).json({ error: `Unknown source: ${source}` });
    }

    // Undo allocations before the delete, so a failure here leaves the payment
    // intact rather than orphaning the subdocs it pushed.
    if (source === "Payment") {
      await allocationService.reverseAllocationsForPayment(id);
    }

    const doc = await Model.findOneAndDelete({ _id: id, organization: orgId });
    if (!doc) {
      return res.status(404).json({ error: "Document not found or not authorized" });
    }

    res.json({ message: "Deleted successfully", id, source });
  } catch (err) {
    console.error("Delete timeline entry error:", err);
    res.status(500).json({ error: "Failed to delete timeline entry" });
  }
};
