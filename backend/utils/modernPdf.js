const PDFDocument = require("pdfkit");
const { toWords } = require("number-to-words");
const path = require("path");
const fs = require("fs");
const axios = require("axios");

// --- HELPER FUNCTIONS ---

function toCurrency(value) {
  if (value === undefined || value === null) return "0.00";
  return `₹ ${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function capitalizeWords(str) {
  if (!str) return "";
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function calculateItemAmount(item) {
  const rate = parseFloat(item.rate) || 0;
  const quantity = parseFloat(item.quantity) || 0;
  const subtotal = rate * quantity;
  const discount = parseFloat(item.discount) || 0;
  if (item.discountType === "percentage") {
    return subtotal * (1 - discount / 100);
  }
  return subtotal - discount;
}

function getItemDiscount(item) {
  const subtotal = (parseFloat(item.rate) || 0) * (parseFloat(item.quantity) || 0);
  const discount = parseFloat(item.discount) || 0;
  if (item.discountType === "percentage") {
    return (subtotal * discount) / 100;
  }
  return discount;
}

function formatDateDDMMYYYY(dateStr) {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  const day = date.getDate().toString().padStart(2, "0");
  const month = date.toLocaleString("default", { month: "short" });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

async function fetchImage(src) {
  if (!src) return null;
  try {
    if (src.startsWith("data:image")) {
      return Buffer.from(src.split(",")[1], "base64");
    } else if (src.startsWith("http")) {
      const response = await axios.get(src, { responseType: "arraybuffer" });
      return Buffer.from(response.data);
    } else {
      if (src.startsWith("/")) {
        const try1 = path.join(__dirname, "..", src);
        if (fs.existsSync(try1)) return fs.readFileSync(try1);
        const try2 = path.join(process.cwd(), src);
        if (fs.existsSync(try2)) return fs.readFileSync(try2);
      } else {
        const try3 = path.join(__dirname, "..", "uploads", src);
        if (fs.existsSync(try3)) return fs.readFileSync(try3);
        const try4 = path.join(process.cwd(), "uploads", src);
        if (fs.existsSync(try4)) return fs.readFileSync(try4);
        if (fs.existsSync(src)) return fs.readFileSync(src);
      }
    }
  } catch (e) {
    console.error(`Error fetching image (${src}):`, e.message);
  }
  return null;
}

function getDocumentType(invoice) {
  if (invoice.deliveryChallanNumber?.startsWith("DC")) return "DELIVERY_CHALLAN";
  if (invoice.quotationNumber?.startsWith("QUO")) return "QUOTATION";
  if (invoice.performaInvoiceNumber?.startsWith("PI")) return "PROFORMA_INVOICE";
  if (invoice.isTaxInvoice) return "TAX_INVOICE";
  return "INVOICE";
}

function getDocumentLabels(docType) {
  const labels = {
    DELIVERY_CHALLAN: { title: "DELIVERY CHALLAN", numberLabel: "Delivery Challan #:", dateLabel: "Delivery Challan Date:", dueDateLabel: "Delivery by:" },
    QUOTATION: { title: "QUOTATION", numberLabel: "Quotation #:", dateLabel: "Quotation Date:", dueDateLabel: "Validity:" },
    PROFORMA_INVOICE: { title: "PROFORMA INVOICE", numberLabel: "Proforma Invoice #:", dateLabel: "Invoice Date:", dueDateLabel: "Due Date:" },
    TAX_INVOICE: { title: "TAX INVOICE", numberLabel: "Invoice #:", dateLabel: "Invoice Date:", dueDateLabel: "Due Date:" },
    INVOICE: { title: "INVOICE", numberLabel: "Invoice #:", dateLabel: "Invoice Date:", dueDateLabel: "Due Date:" },
  };
  return labels[docType];
}

function getDocumentNumber(invoice) {
  if (invoice.deliveryChallanNumber) return invoice.deliveryChallanNumber;
  if (invoice.quotationNumber) return invoice.quotationNumber;
  if (invoice.performaInvoiceNumber) return invoice.performaInvoiceNumber;
  return invoice.invoiceNumber || "N/A";
}

module.exports = async function generatePdf(invoice, bankDetails, OrgDetails) {
  // Pre-fetch images
  const logoBuffer = await fetchImage(OrgDetails?.logoUrl || OrgDetails?.logo);
  const sigToFetch = invoice?.signature?.startsWith("Name") ? null : (invoice?.signature || OrgDetails?.signatureUrl);
  const signatureBuffer = await fetchImage(sigToFetch);

  const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
  const buffers = [];
  doc.on("data", buffers.push.bind(buffers));

  // --- FONT REGISTRATION ---
  const robotoPath = path.join(__dirname, "fonts", "Roboto-Regular.ttf");
  const robotoBoldPath = path.join(__dirname, "fonts", "Roboto-Bold.ttf");
  const meieFontPath = path.join(__dirname, "fonts", "MeieScript-Regular.ttf");

  if (fs.existsSync(robotoPath)) doc.registerFont("Roboto", robotoPath);
  if (fs.existsSync(robotoBoldPath)) doc.registerFont("Roboto-Bold", robotoBoldPath);
  if (fs.existsSync(meieFontPath)) doc.registerFont("MeieScript", meieFontPath);

  doc.font("Roboto");

  const startX = 40;
  const pageRight = doc.page.width - startX;
  const pageWidth = pageRight - startX;
  let currentPage = 1;

  const docType = getDocumentType(invoice);
  const labels = getDocumentLabels(docType);
  const documentNumber = getDocumentNumber(invoice);

  function addHeader() {
    let cursorY = 40;

    // Title Top Left
    // Title Top Left
    doc.fillColor("#0044cc").font("Roboto-Bold").fontSize(12).text("TAX INVOICE", startX, cursorY);
    cursorY += 20;

    // Org Details Left
    doc.fillColor("black").fontSize(20).text(OrgDetails?.companyName || "Company Name", startX, cursorY);
    cursorY += 25;

    if (OrgDetails?.gstin) {
      doc.fontSize(9).font("Roboto-Bold").text(`GSTIN ${OrgDetails?.gstin}`, startX, cursorY);
      cursorY += 14;
    }

    doc.fontSize(9).font("Roboto").text(OrgDetails?.address || "Company Address", startX, cursorY, { width: 330 });

    // Use font to measure height of address to keep consistency
    const addrH = doc.heightOfString(OrgDetails?.address || "Company Address", { width: 330 });
    cursorY += (addrH + 5);
    doc.text(`Mobile ${OrgDetails?.mobile || "N/A"}   Email ${OrgDetails?.email || "N/A"}`, startX, cursorY);

    // Logo Right. `fit` caps width AND height so a tall logo can't grow past
    // the header band; it's right-aligned within the 100-wide slot.
    const logoWidth = 100;
    const logoHeight = 50;
    const logoY = 30;
    const logoX = pageRight - logoWidth;

    if (logoBuffer) {
      doc.image(logoBuffer, logoX, logoY, { fit: [logoWidth, logoHeight], align: "right" });
    }
    // Move text ABOVE logo
    doc.fontSize(8).fillColor("gray").text("ORIGINAL FOR RECIPIENT", startX, logoY - 10, { align: "right", width: pageWidth });

    cursorY += 15; // Reduced from 30

    // Info Bar (3 columns)
    const infoY = cursorY;
    const availableWidth = pageWidth - 100;
    const colW = availableWidth / 3;

    doc.fillColor("black").font("Roboto-Bold").fontSize(9);

    // Col 1: Invoice # (Left)
    doc.text(`${labels.numberLabel} ${documentNumber}`, startX, infoY, { width: colW, align: "left" });

    // Col 2: Date (Left/Center in middle column)
    doc.text(`${labels.dateLabel} ${formatDateDDMMYYYY(invoice.date)}`, startX + colW, infoY, { width: colW, align: "left" });

    // Col 3: Due Date (Left Aligned to match Shipping Address below)
    doc.text(`${labels.dueDateLabel} ${formatDateDDMMYYYY(invoice.dueDate)}`, startX + (colW * 2), infoY, { width: colW, align: "left" });

    cursorY += 20;
    doc.lineWidth(0.5).strokeColor("#cccccc").moveTo(startX, cursorY).lineTo(pageRight, cursorY).stroke();
    cursorY += 10;

    // Customer / Addresses (3 columns)
    const addrY = cursorY;

    // Customer
    doc.font("Roboto-Bold").fontSize(8).fillColor("gray").text("Customer Details:", startX, addrY);
    doc.font("Roboto-Bold").fontSize(9).fillColor("black").text(invoice?.deal?.company?.name || invoice?.deal?.contact?.name || "N/A", startX, addrY + 12);
    doc.font("Roboto").text(`Ph: ${invoice?.deal?.contact?.phone || "N/A"}`, startX, addrY + 24);

    // Billing
    doc.font("Roboto-Bold").fontSize(8).fillColor("gray").text("Billing address:", startX + colW, addrY);
    const bAddr = invoice?.billingAddress || invoice?.deal?.contact?.address || "N/A";
    doc.font("Roboto").fontSize(9).fillColor("black").text(bAddr, startX + colW, addrY + 12, { width: colW - 10 });

    // Shipping
    doc.font("Roboto-Bold").fontSize(8).fillColor("gray").text("Shipping address:", startX + colW * 2, addrY);
    const sAddr = invoice?.shippingAddress || invoice?.billingAddress || invoice?.deal?.contact?.address || "N/A";
    doc.font("Roboto").fontSize(9).fillColor("black").text(sAddr, startX + colW * 2, addrY + 12, { width: colW - 10 });

    cursorY += 35; // Compacted from 45
    doc.font("Roboto-Bold").fontSize(9).text(`Place of Supply: ${OrgDetails?.state?.toUpperCase() || "N/A"}`, startX, cursorY);
    cursorY += 15;
    doc.lineWidth(1).strokeColor("black").moveTo(startX, cursorY).lineTo(pageRight, cursorY).stroke();

    return cursorY + 2;
  }

  function addTableHeader(y) {
    doc.fontSize(8).font("Roboto-Bold").fillColor("black");
    const cols = [
      { text: "#", x: startX, w: 20 },
      { text: "Item", x: startX + 25, w: 150 },
      { text: "Rate/Item", x: startX + 180, w: 65, align: "right" },
      { text: "Qty", x: startX + 250, w: 30, align: "right" },
      { text: "Taxable Value", x: startX + 285, w: 70, align: "right" },
      { text: "Tax Amount", x: startX + 360, w: 70, align: "right" },
      { text: "Amount", x: startX + 435, w: 60, align: "right" },
    ];

    cols.forEach(c => {
      doc.text(c.text, c.x, y + 2, { width: c.w, align: c.align || "left" });
    });

    doc.lineWidth(1).strokeColor("black").moveTo(startX, y + 14).lineTo(pageRight, y + 14).stroke();
    return y + 16;
  }



  // --- START GENERATING ---
  let cursorY = addHeader();
  cursorY = addTableHeader(cursorY);

  let grandTotalTaxable = 0;
  let grandTotalTax = 0;
  let grandTotalAmount = 0;
  let totalQty = 0;

  (invoice?.items || []).forEach((item, index) => {
    // 1. Calculate Amounts
    const rate = parseFloat(item.rate) || 0;
    const qty = parseFloat(item.quantity) || 0;
    const taxableValue = calculateItemAmount(item);

    // Attempt to get tax rate from item, fallback to invoice global rate
    const taxRate = parseFloat(item.tax || item.gstRate || invoice.gstRate || 0);
    const taxAmount = (taxableValue * taxRate) / 100;
    const finalAmount = taxableValue + taxAmount;

    // 2. Accumulate Totals
    grandTotalTaxable += taxableValue;
    grandTotalTax += taxAmount;
    grandTotalAmount += finalAmount;
    totalQty += qty;

    // 3. Layout Calculations
    const colNameW = 150;
    // Calculate height based on item name wrapping
    const nameHeight = doc.heightOfString(item.name || "Item", { width: colNameW });
    const rowHeight = Math.max(nameHeight, 15) + 10; // Ensure min-height and padding

    // 4. Pagination Check
    // Check if adding this row + footer space exceeds page height
    if (cursorY + rowHeight > doc.page.height - 50) {
      doc.addPage();
      cursorY = addHeader(); // Retain header on new page
      cursorY = addTableHeader(cursorY);
    }

    // 5. Render Row
    const y = cursorY;
    doc.fillColor("black").font("Roboto").fontSize(8);

    // Col 1: #
    doc.text((index + 1).toString(), startX, y, { width: 20 });

    // Col 2: Item Name
    doc.text(item.name || "Item", startX + 25, y, { width: colNameW });

    // Col 3: Rate
    doc.text(toCurrency(rate), startX + 180, y, { width: 65, align: "right" });

    // Col 4: Qty
    doc.text(qty.toString(), startX + 250, y, { width: 30, align: "right" });

    // Col 5: Taxable Value
    doc.text(toCurrency(taxableValue), startX + 285, y, { width: 70, align: "right" });

    // Col 6: Tax Amount
    doc.text(toCurrency(taxAmount), startX + 360, y, { width: 70, align: "right" });

    // Col 7: Amount
    doc.text(toCurrency(finalAmount), startX + 435, y, { width: 60, align: "right" });

    // Update cursor
    cursorY += rowHeight;
  });

  // Draw thin line below the table (Revert bold)
  doc.lineWidth(0.5).strokeColor("#cccccc").moveTo(startX, cursorY).lineTo(pageRight, cursorY).stroke();

  // Totals Section
  // Atomic Block Check: Totals + Summary + Payable (Sandwich Layout)
  // Height approx: Taxable(15) + Tax(15) + Total(20) + Line(5) + Words(15) + Line(5) + Payable(25) ~ 140px
  const totalsBlockHeight = 140;
  if (cursorY + totalsBlockHeight > doc.page.height - 50) {
    doc.addPage();
    cursorY = addHeader();
  }

  cursorY += 10;
  const totalsX = startX + 350;
  const totalsW = pageWidth - 350;

  doc.font("Roboto").fontSize(9);
  doc.text("Taxable Amount", totalsX, cursorY);
  doc.text(toCurrency(grandTotalTaxable), totalsX, cursorY, { align: "right", width: totalsW });

  cursorY += 15;
  const taxLabel = invoice.transactionType === "intra" ? `CGST/SGST (${invoice.gstRate}%)` : `IGST (${invoice.gstRate}%)`;
  doc.text(taxLabel, totalsX, cursorY);
  doc.text(toCurrency(grandTotalTax), totalsX, cursorY, { align: "right", width: totalsW });

  cursorY += 20;
  doc.font("Roboto-Bold").fontSize(11).fillColor("black");
  doc.text("Total", totalsX, cursorY);
  doc.fontSize(14).text(toCurrency(grandTotalAmount), totalsX, cursorY - 3, { align: "right", width: totalsW });

  // UI Change: Line -> Items/Words -> Line -> Payable
  cursorY += 20;
  doc.lineWidth(0.5).strokeColor("#cccccc").moveTo(startX, cursorY).lineTo(pageRight, cursorY).stroke();

  cursorY += 5;
  doc.font("Roboto").fontSize(8).fillColor("gray");
  doc.text(`Total Items / Qty : ${invoice.items?.length || 0} / ${totalQty.toFixed(3)}`, startX, cursorY);
  const words = capitalizeWords(toWords(Math.round(grandTotalAmount)));
  doc.text(`Total amount (in words): INR ${words} Rupees Only`, startX + 160, cursorY, { width: pageWidth - 160, align: "right" });

  cursorY += 15;
  doc.lineWidth(0.5).strokeColor("#cccccc").moveTo(startX, cursorY).lineTo(pageRight, cursorY).stroke();

  cursorY += 10;
  doc.font("Roboto-Bold").fontSize(10).fillColor("black");
  // Align "Amount Payable" to right, similar to image 2
  doc.text("Amount Payable:", totalsX, cursorY);
  doc.text(toCurrency(grandTotalAmount), totalsX, cursorY, { align: "right", width: totalsW });

  // Bank & Signature Block
  // Height approx: Header(12) + Bank Rows(4x10) + Spacing(40) ~ 100px
  const bankBlockHeight = 120;
  if (cursorY + bankBlockHeight > doc.page.height - 50) {
    doc.addPage();
    cursorY = addHeader();
  }

  cursorY += 40;
  const qrBoxSize = 70;
  doc.font("Roboto-Bold").fontSize(9).fillColor("black").text("Pay using UPI:", startX, cursorY);
  doc.rect(startX, cursorY + 12, qrBoxSize, qrBoxSize).strokeColor("#cccccc").lineWidth(0.5).stroke();
  doc.fontSize(6).fillColor("gray").text("QR Code Placeholder", startX + 5, cursorY + 40, { width: qrBoxSize - 10, align: "center" });

  const bankX = startX + 90;
  doc.font("Roboto-Bold").fontSize(9).fillColor("black").text("Bank Details:", bankX, cursorY);
  doc.font("Roboto").fontSize(8);
  doc.text(`Bank:           ${bankDetails?.bank || "N/A"}`, bankX, cursorY + 15);
  doc.text(`Account #:   ${bankDetails?.accountNumber || "N/A"}`, bankX, cursorY + 25);
  doc.text(`IFSC:           ${bankDetails?.ifscCode || "N/A"}`, bankX, cursorY + 35);
  doc.text(`Branch:        ${bankDetails?.branch || "N/A"}`, bankX, cursorY + 45);

  // Signature
  const sigX = pageRight - 150;
  const compName = OrgDetails?.companyName || "N/A";
  doc.font("Roboto").fontSize(8).text(`For ${compName}`, sigX, cursorY + 5, { align: "right", width: 150 });

  if (signatureBuffer) {
    doc.image(signatureBuffer, sigX + 50, cursorY + 15, { width: 80 });
  } else if (invoice?.signature && invoice.signature !== "") {
    doc.font("MeieScript").fontSize(18).text(invoice.signature, sigX, cursorY + 30, { align: "right", width: 150 });
  } else {
    doc.rect(sigX + 60, cursorY + 15, 80, 40).dash(2, { space: 2 }).strokeColor("#cccccc").stroke();
  }
  doc.font("Roboto").fontSize(8).text("Authorized Signatory", sigX, cursorY + 75, { align: "right", width: 150 });

  // Notes & Terms

  // Explicitly calculate height needed for Notes & Terms
  // Header (15) + "Thank you" (15) + "Terms" Header (20) + 4 lines * 11 (44) + Spacing (20) ≈ 120
  const notesHeight = 150;

  // Ensure we move down past the Bank Details / QR Box height
  // Bank details start at previous cursorY (top of bank block). 
  // We need to move cursorY to be BELOW the bank block.
  // QR Box is 70px. Let's assume the bank block is roughly 80px total with padding.

  // If we are already near the bottom, force page break before Notes
  // Previous cursorY was at the START of Bank details.
  // So effective Y is cursorY + 80.
  // Check if Notes fit on current page considering potential shift
  // Advance cursor past the Bank/Sig block (approx 90px from start of bank block)
  const bankBlockOffset = 90;

  if (cursorY + bankBlockOffset + notesHeight > doc.page.height - 50) {
    doc.addPage();
    cursorY = addHeader();
  } else {
    cursorY += bankBlockOffset;
  }

  doc.font("Roboto-Bold").fontSize(9).fillColor("black").text("Notes:", startX, cursorY);
  doc.font("Roboto").text("Thank you for the Business", startX, cursorY + 12);

  cursorY += 25; // Compacted from 35
  doc.font("Roboto-Bold").text("Terms and Conditions:", startX, cursorY);
  const terms = [
    "1. Goods once sold cannot be taken back or exchanged.",
    "2. We are not the manufacturers, company will stand for warranty as per their terms and conditions.",
    "3. Interest @24% p.a. will be charged for uncleared bills beyond 15 days.",
    "4. Subject to local Jurisdiction."
  ];
  doc.font("Roboto").fontSize(8).fillColor("black");
  terms.forEach((t, i) => {
    doc.text(t, startX, cursorY + 12 + i * 11);
  });

  // --- FOOTER GENERATION (Post-Process) ---
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);

    // Fix: Temporarily remove bottom margin to prevent auto-page-break
    const oldBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const footerY = doc.page.height - 30; // 30px from bottom (inside original 40px margin)
    doc.fontSize(8).fillColor("gray").font("Roboto");

    // Page Number on Left
    doc.text(`Page ${i + 1} of ${range.count}`, startX, footerY, { lineBreak: false });

    // "Digitally Signed" besides it (approx 60px offset)
    doc.text("This is a digitally signed document.", startX + 60, footerY, { lineBreak: false });

    // Restore margin
    doc.page.margins.bottom = oldBottomMargin;
  }

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
  });
};