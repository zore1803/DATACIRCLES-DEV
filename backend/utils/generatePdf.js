const PDFDocument = require("pdfkit");
const { toWords } = require("number-to-words");
const path = require("path");
const fs = require("fs");
const axios = require("axios");

// --- HELPER FUNCTIONS ---

function toCurrency(value) {
  if (value === undefined || value === null) return "0.00";
  // Assuming INR, format with 2 decimals
  return `₹ ${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const day = date.getDate().toString().padStart(2, "0");
  const month = date.toLocaleString("default", { month: "short" });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

function capitalizeWords(str) {
  if (!str) return "";
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// Robust Image Fetcher (Handles Base64, S3/HTTP URLs, and Local Paths)
async function fetchImage(src) {
  if (!src) return null;

  try {
    // 1. Base64
    if (src.startsWith('data:image')) {
      return Buffer.from(src.split(',')[1], 'base64');
    }
    // 2. HTTP/HTTPS (S3, CloudFront, etc.)
    else if (src.startsWith('http') || src.startsWith('https')) {
      const response = await axios.get(src, { responseType: 'arraybuffer' });
      return Buffer.from(response.data);
    }
    // 3. Local File System
    else {
      // Resolve path
      let p = src;
      // If path starts with /, assume it is relative to project root (e.g. /uploads/file.png)
      // __dirname is backend/utils, so '..' takes us to backend/
      if (src.startsWith('/')) {
        // Try resolving against backend root
        const try1 = path.join(__dirname, '..', src);
        if (fs.existsSync(try1)) return fs.readFileSync(try1);

        // Try resolving against CWD (usually where server.js runs)
        const try2 = path.join(process.cwd(), src);
        if (fs.existsSync(try2)) return fs.readFileSync(try2);
      } else {
        // Relative path without slash
        const try3 = path.join(__dirname, '..', 'uploads', src);
        if (fs.existsSync(try3)) return fs.readFileSync(try3);

        const try4 = path.join(process.cwd(), 'uploads', src);
        if (fs.existsSync(try4)) return fs.readFileSync(try4);

        // Absolute path on system?
        if (fs.existsSync(src)) return fs.readFileSync(src);
      }
    }
  } catch (e) {
    console.error(`Error fetching image (${src}):`, e.message);
  }
  return null;
}

module.exports = async function generatePdf(invoice, bankDetails, OrgDetails) {

  // Pre-fetch images asynchronously before starting PDF stream
  const logoBuffer = await fetchImage(OrgDetails?.logoUrl);

  // Signature Selection Logic
  let sigToFetch = null;
  // If invoice signature looks like a file/url, use it
  if (invoice?.signature && (invoice.signature.startsWith('http') || invoice.signature.startsWith('/') || invoice.signature.startsWith('data:'))) {
    sigToFetch = invoice.signature;
  }
  // Otherwise if Org has signature, use that
  else if (OrgDetails?.signatureUrl) {
    sigToFetch = OrgDetails.signatureUrl;
  }
  // (Note: if invoice.signature is just "Name", we won't fetch it, and will fallback to text rendering below)

  const signatureBuffer = await fetchImage(sigToFetch);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 30, size: "A4", bufferPages: true });
      const buffers = [];

      doc.on("data", (buffer) => buffers.push(buffer));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err) => reject(err));

      // Register Roboto for Rupee symbol support (₹)
      const robotoPath = path.join(__dirname, "fonts", "Roboto-Regular.ttf");
      const robotoBoldPath = path.join(__dirname, "fonts", "Roboto-Bold.ttf");

      if (fs.existsSync(robotoPath)) {
        doc.registerFont("Roboto", robotoPath);
      } else {
        doc.font("Helvetica");
      }

      if (fs.existsSync(robotoBoldPath)) {
        doc.registerFont("Roboto-Bold", robotoBoldPath);
      } else {
        doc.registerFont("Roboto-Bold", "Helvetica-Bold");
      }

      // Set default font
      if (fs.existsSync(robotoPath)) {
        doc.font("Roboto");
      } else {
        doc.font("Helvetica");
      }

      // --- CONSTANTS ---
      const startX = 30;
      const startY = 30; // Top margin
      const pageWidth = doc.page.width - 2 * startX; // ~535
      const pageRight = startX + pageWidth;
      const fontSizeNormal = 8;
      const fontSizeBold = 8;

      let cursorY = startY;

      // --- HELPERS ---
      function drawHLine(y, w = 1) {
        doc.lineWidth(w).strokeColor("black").moveTo(startX, y).lineTo(pageRight, y).stroke();
      }
      function drawVLine(x, y1, y2, w = 1) {
        doc.lineWidth(w).strokeColor("black").moveTo(x, y1).lineTo(x, y2).stroke();
      }
      function drawCell(text, x, y, w, h, bold = false, align = "left", size = fontSizeNormal) {
        if (bold) doc.font("Roboto-Bold");
        else doc.font("Roboto");
        doc.fontSize(size).fillColor("black");

        // Simple vertical centering approach for single line
        // For multiline, we just start from y + padding
        const padY = 3;
        // Handle potential null/undefined text
        const safeText = text || "";
        doc.text(safeText, x + 3, y + padY, { width: w - 6, align: align });
      }

      // --- 1. HEADER SECTION ---
      // Logo (Left), Company (Left/Center), Title (Right)
      const headerH = 90;

      // Logo area. `fit` caps BOTH width and height (50x50) so a tall/portrait
      // logo scales down to fit the header instead of overflowing into the grid
      // below. A logo that fails to load is simply skipped — never an error
      // string drawn onto the customer-facing invoice.
      let logoWidth = 0;
      if (logoBuffer) {
        try {
          doc.image(logoBuffer, startX, cursorY, { fit: [50, 50] });
          logoWidth = 60;
        } catch (e) { console.error("Error drawing logo", e); }
      }

      // Company Details
      const contentX = startX + (logoWidth > 0 ? 60 : 5);
      doc.font("Roboto-Bold").fontSize(12).text(OrgDetails?.companyName || "ITC LIMITED", contentX, cursorY);
      doc.fontSize(8).font("Roboto")
        .text(OrgDetails?.address || "No. 18, ITC Limited Banaswadi Road, Pulikeshi Nagar\nBengaluru Urban, KARNATAKA, 560005", contentX, cursorY + 15, { width: 250 });
      doc.font("Roboto-Bold").text(`GSTIN: ${OrgDetails?.gstin || "29AAACI5950L1Z6"}`, contentX, cursorY + 38);
      doc.font("Roboto").text(`Mobile: ${OrgDetails?.mobile || "9999999999"}   Email: ${OrgDetails?.email || "Swipe@gmail.com"}`, contentX, cursorY + 50);

      // Title Right
      doc.font("Roboto-Bold").fontSize(10).fillColor("#007bff")
        .text("TAX INVOICE", startX, cursorY, { align: "right", width: pageWidth });
      doc.fillColor("black").fontSize(8)
        .text("ORIGINAL FOR RECIPIENT", startX, cursorY + 12, { align: "right", width: pageWidth });

      cursorY += headerH;

      // --- 2. GRID SECTION (Customer + Invoice Info) ---
      // Fixed height for grid rows to match look

      const gridTop = cursorY;
      const gridHeight = 120; // Increased height to prevent overlap
      const gridBottom = gridTop + gridHeight;
      const midX = startX + pageWidth / 2;
      const rightColMid = midX + (pageWidth / 2) / 2;

      // Draw Main Box
      doc.lineWidth(1).rect(startX, gridTop, pageWidth, gridHeight).stroke();

      // Vertical Split (Left/Right)
      drawVLine(midX, gridTop, gridBottom);

      // LEFT PANE: Customer Details
      // Content flows freely in the left box
      let leftY = gridTop + 5;
      const leftPad = startX + 5;
      const leftW = (pageWidth / 2) - 10;

      doc.font("Roboto-Bold").fontSize(8).text("Customer Details:", leftPad, leftY);
      leftY += 12;
      const custName = invoice?.deal?.company?.name || invoice?.deal?.contact?.name || "Customer Name";
      doc.text(custName, leftPad, leftY);
      leftY += 12;
      doc.text(`GSTIN: ${invoice?.receiverGSTIN || ""}`, leftPad, leftY);
      leftY += 12;
      doc.text("Billing address:", leftPad, leftY);
      leftY += 10;
      const billAddr = invoice?.billingAddress || invoice?.deal?.contact?.address || "";
      // Increased height constraint for billing address
      doc.font("Roboto").text(billAddr.substring(0, 150), leftPad, leftY, { width: leftW, height: 40 });
      leftY += 35; // increased spacing

      doc.font("Roboto-Bold").text("Shipping address:", leftPad, leftY);
      leftY += 10;
      // Use billing as shipping if not separate
      doc.font("Roboto").text(billAddr.substring(0, 80), leftPad, leftY, { width: leftW });

      // RIGHT PANE: Grid Rows
      // Row 1 Line
      const rH = 25; // Increased from 20 to 25 for centering
      const r1Y = gridTop + rH;
      const r2Y = r1Y + rH;
      const r3Y = r2Y + rH;

      // Horizontal Lines (Right Side Only)
      doc.moveTo(midX, r1Y).lineTo(pageRight, r1Y).stroke();
      doc.moveTo(midX, r2Y).lineTo(pageRight, r2Y).stroke();
      doc.moveTo(midX, r3Y).lineTo(pageRight, r3Y).stroke();

      // Vertical Line (Right Grid Split) - Only for top 3 rows
      drawVLine(rightColMid, gridTop, r3Y);

      // Cell Content Filling
      const rPad = 4;

      // R1: Inv# | Date
      drawLabelValue("Invoice #:", invoice.invoiceNumber, midX, gridTop, rightColMid);
      drawLabelValue("Date:", formatDate(invoice.date), rightColMid, gridTop, pageRight);

      // R2: Place Supply | Due Date
      drawLabelValue("Place of Supply:", invoice.placeOfSupply || "29-KARNATAKA", midX, r1Y, rightColMid);
      drawLabelValue("Due Date:", formatDate(invoice.dueDate), rightColMid, r1Y, pageRight);

      // R3: Eway | Vehicle
      drawLabelValue("Eway Bill #:", "", midX, r2Y, rightColMid);
      drawLabelValue("Vehicle Number:", "", rightColMid, r2Y, pageRight);

      // R4: Dispatch From (Full Width of Right Column)
      doc.font("Roboto-Bold").fontSize(8).text("Dispatch From:", midX + rPad, r3Y + 4);
      // Company Name removed per request
      doc.font("Roboto").text(OrgDetails?.address || "", midX + rPad, r3Y + 16, { width: (pageWidth / 2) - 10, height: 42 });

      function drawLabelValue(label, value, x1, y, x2) {
        // Centering in 25px height
        // Text block ~18px (8px + 2px gap + 8px)
        // Top padding ~3.5px -> Round to 4 or 5
        doc.font("Roboto").fontSize(8).text(label, x1 + rPad, y + 5);
        doc.font("Roboto-Bold").text(value || "", x1 + rPad, y + 15);
      }

      cursorY = gridBottom;

      // --- 3. ITEMS TABLE ---
      // Columns: # | Item | HSN/SAC | Rate/Item | Qty | Taxable Value | IGST | Amount
      // Matching screenshot logic
      const tableHeaders = [
        { label: "#", w: 25, align: "center" },
        { label: "Item", w: 140, align: "left" }, // Wide
        { label: "HSN/SAC", w: 50, align: "center" },
        { label: "Rate/Item", w: 60, align: "right" },
        { label: "Qty", w: 40, align: "right" },
        { label: "Taxable Value", w: 70, align: "right" },
        // Tax Col (IGST or CGST/SGST?) - screenshot has IGST
        { label: "IGST", w: 70, align: "right" },
        { label: "Amount", w: 80, align: "right" }
      ];
      // Adjust last col width to fit page perfectly
      const currentW = tableHeaders.reduce((a, b) => a + b.w, 0);
      const diff = pageWidth - currentW;
      tableHeaders[tableHeaders.length - 1].w += diff; // Add remainder to Amount

      const headerRowH = 20;
      const itemRowH = 25; // Adjusted per request for "little space only"

      // Header Row (Bordered)
      // Grid top is cursorY
      drawHLine(cursorY + headerRowH, 1); // Bottom of header

      let tx = startX;
      tableHeaders.forEach(h => {
        drawCell(h.label, tx, cursorY, h.w, headerRowH, true, h.align);
        // Right vertical line (Inner)
        drawVLine(tx + h.w, cursorY, cursorY + headerRowH, 0.5);
        tx += h.w;
      });
      drawVLine(startX, cursorY, cursorY + headerRowH, 1); // Leftmost line
      drawVLine(pageRight, cursorY, cursorY + headerRowH, 1); // Rightmost line (Bold)

      cursorY += headerRowH;

      // Items Data
      let totalQty = 0;
      let totalLines = 0; // count items
      let grandTotalTaxable = 0;
      let grandTotalIGST = 0;
      let grandTotalAmount = 0;

      invoice.items.forEach((item, index) => {
        const rate = parseFloat(item.rate) || 0;
        const qty = parseFloat(item.quantity) || 0;
        const subtotal = rate * qty;

        let disc = 0;
        if (item.discountType === "percentage") disc = (subtotal * (item.discount || 0)) / 100;
        else disc = item.discount || 0;

        const taxable = subtotal - disc;

        // Tax
        const gstRate = invoice.gstRate || 18;
        let igstVal = 0;
        if (invoice.isTaxInvoice) {
          igstVal = (taxable * gstRate) / 100;
        }
        const totalLine = taxable + igstVal;

        // Aggregates
        totalQty += qty;
        totalLines++;
        grandTotalTaxable += taxable;
        grandTotalIGST += igstVal;
        grandTotalAmount += totalLine;

        // Draw
        if (cursorY > doc.page.height - 100) {
          doc.addPage();
          cursorY = startY;
          drawHLine(cursorY);
        }

        tx = startX;
        // #
        drawCell((index + 1).toString(), tx, cursorY, tableHeaders[0].w, itemRowH, false, "center");
        drawVLine(tx + tableHeaders[0].w, cursorY, cursorY + itemRowH, 0.5); tx += tableHeaders[0].w;
        // Item
        drawCell(item.name || item.itemId?.name || "", tx, cursorY, tableHeaders[1].w, itemRowH, true);
        drawVLine(tx + tableHeaders[1].w, cursorY, cursorY + itemRowH, 0.5); tx += tableHeaders[1].w;
        // HSN
        drawCell(item.hsn || "", tx, cursorY, tableHeaders[2].w, itemRowH, false, "center");
        drawVLine(tx + tableHeaders[2].w, cursorY, cursorY + itemRowH, 0.5); tx += tableHeaders[2].w;
        // Rate
        drawCell(toCurrency(rate).replace("₹ ", ""), tx, cursorY, tableHeaders[3].w, itemRowH, false, "right");
        drawVLine(tx + tableHeaders[3].w, cursorY, cursorY + itemRowH, 0.5); tx += tableHeaders[3].w;
        // Qty
        drawCell(`${qty} BOX`, tx, cursorY, tableHeaders[4].w, itemRowH, false, "right"); // BOX hardcoded from screenshot style
        drawVLine(tx + tableHeaders[4].w, cursorY, cursorY + itemRowH, 0.5); tx += tableHeaders[4].w;
        // Taxable
        drawCell(taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 }), tx, cursorY, tableHeaders[5].w, itemRowH, false, "right");
        drawVLine(tx + tableHeaders[5].w, cursorY, cursorY + itemRowH, 0.5); tx += tableHeaders[5].w;
        // IGST
        // Format: Value (Rate%) e.g. 5,948.69 (18%)
        const igstStr = igstVal > 0 ? `${igstVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${gstRate}%)` : "";
        drawCell(igstStr, tx, cursorY, tableHeaders[6].w, itemRowH, false, "right");
        drawVLine(tx + tableHeaders[6].w, cursorY, cursorY + itemRowH, 0.5); tx += tableHeaders[6].w;
        // Amount
        drawCell(totalLine.toLocaleString('en-IN', { minimumFractionDigits: 2 }), tx, cursorY, tableHeaders[7].w, itemRowH, false, "right");

        // Borders
        drawVLine(startX, cursorY, cursorY + itemRowH, 1); // Left
        drawVLine(pageRight, cursorY, cursorY + itemRowH, 1); // Right
        // drawHLine(cursorY + itemRowH); // Bottom removed per request

        cursorY += itemRowH;
      });

      // Enforce Minimum Table Height (Fill empty space)
      // Table Body Start is roughly ~260. We want a decent height.
      const minBodyBottom = 500; // Approx 300px height for items

      if (cursorY < minBodyBottom) {
        const fillY = minBodyBottom;

        let tx = startX;
        // Draw verticals for all columns down to fillY (Inner as thin)
        tableHeaders.forEach(h => {
          drawVLine(tx + h.w, cursorY, fillY, 0.5);
          tx += h.w;
        });
        drawVLine(startX, cursorY, fillY, 1); // Leftmost normal bold
        drawVLine(pageRight, cursorY, fillY, 1); // Rightmost normal bold

        cursorY = fillY;
      }

      // --- 4. TOTALS SECTION ---
      // Borders alignment

      const totalsTop = cursorY;
      const totalsHeight = 120;

      const splitX = startX + (pageWidth * 0.60);

      drawHLine(totalsTop, 1); // Top border
      drawVLine(startX, totalsTop, totalsTop + totalsHeight, 1); // Left
      drawVLine(pageRight, totalsTop, totalsTop + totalsHeight, 1); // Right
      drawVLine(splitX, totalsTop, totalsTop + totalsHeight, 1); // Middle Split
      drawHLine(totalsTop + totalsHeight, 1); // Bottom

      // LEFT CONTENT
      let ly = totalsTop + 5;
      const lp = startX + 5;
      doc.font("Roboto").text(`Total Items / Qty : ${totalLines} / ${totalQty}`, lp, ly);
      ly += 12;
      const words = capitalizeWords(toWords(Math.round(grandTotalAmount)));
      doc.font("Roboto").text(`Total amount (in words): INR ${words} Rupees Only.`, lp, ly, { width: splitX - lp - 5 });
      ly += 24;

      doc.font("Roboto-Bold").text("Bank Details:", lp, ly);
      ly += 12;
      doc.font("Roboto").text(`Bank:         ${bankDetails?.bank || "IndusInd Bank"}`, lp, ly);
      doc.text(`Account #: ${bankDetails?.accountNumber || "259500001833"}`, lp, ly + 12);
      doc.text(`IFSC:         ${bankDetails?.ifscCode || "INDB0001465"}`, lp, ly + 24);
      doc.text(`Branch:      ${bankDetails?.branch || "Nagercoil"}`, lp, ly + 36);

      doc.text(`UPI ID: www.getswipe.in`, lp, ly + 52);

      // QR Code
      const qrSize = 60;
      // doc.rect(splitX - qrSize - 5, ly, qrSize, qrSize).stroke();

      // RIGHT CONTENT (Totals)
      let ry = totalsTop;
      const rp = splitX + 5;
      const rv = pageRight - 5;
      const rw = pageRight - splitX - 10;
      const rRowH = 15;

      // Taxable Amount
      doc.font("Roboto-Bold").fontSize(8).text("Taxable Amount", splitX + 5, ry + 6, { align: "right", width: rw / 2 });
      doc.font("Roboto").text(toCurrency(grandTotalTaxable).replace("₹ ", "₹"), splitX + rw / 2, ry + 6, { align: "right", width: rw / 2 });

      // doc.lineWidth(1.5).strokeColor("black").moveTo(splitX, ry + rRowH).lineTo(pageRight, ry + rRowH).stroke();
      ry += rRowH;

      // IGST
      doc.font("Roboto-Bold").text(`IGST ${invoice.gstRate}%`, splitX + 5, ry + 6, { align: "right", width: rw / 2 });
      doc.font("Roboto").text(toCurrency(grandTotalIGST).replace("₹ ", "₹"), splitX + rw / 2, ry + 6, { align: "right", width: rw / 2 });

      doc.lineWidth(1).strokeColor("black").moveTo(splitX, ry + rRowH).lineTo(pageRight, ry + rRowH).stroke();
      ry += rRowH;

      // Final Total Area - Moved UP
      const totalRowY = ry;
      const totalH = 35; // Total box height

      // Line above total is technically the bottom line of the previous row (which is at ry).
      // But let's reinforce it or rely on previous strokes. 
      // Previous block drew line at ry. 

      // "Total" Label
      doc.font("Roboto-Bold").fontSize(12).fillColor("black").text("Total", splitX + 5, totalRowY + 12, { align: "right", width: rw / 2 });

      // "Total" Value - Larger
      const totalValY = totalRowY + 10;
      doc.fontSize(12).font("Roboto")
        .text(toCurrency(grandTotalAmount).replace("₹ ", "₹"), splitX + 50, totalValY + 2, { align: "right", width: rw - 50 });

      // Separator Line
      doc.lineWidth(1).strokeColor("black").moveTo(splitX, totalRowY + 28).lineTo(pageRight, totalRowY + 28).stroke();

      // Paid tag (Defaulting to Paid)
      const paidTxt = "Amount Paid";
      const tickW = 15; // Space for tick
      doc.fontSize(10);
      const txtW = doc.widthOfString(paidTxt);

      // Align right logic
      const groupRightEdge = splitX + rw;
      const paidStartX = groupRightEdge - (tickW + txtW);
      const paidTextY = totalRowY + 30; // Slightly lower

      // Draw Vector Tick
      doc.save();
      doc.lineWidth(1.5).strokeColor("green");
      const tickX = paidStartX;
      const tickY = paidTextY;

      // Draw tick roughly centered in 10px height
      doc.moveTo(tickX + 1, tickY + 5)
        .lineTo(tickX + 4, tickY + 8)
        .lineTo(tickX + 9, tickY + 2)
        .stroke();
      doc.restore();

      // Draw Text
      doc.fillColor("black").text(paidTxt, paidStartX + tickW, paidTextY, { width: txtW, align: "left" });

      // Reset cursorY to match layout expectation
      cursorY = totalsTop + totalsHeight;

      cursorY = totalsTop + totalsHeight;

      // --- 5. HSN SUMMARY (Footer Grid) ---
      const hsnTop = cursorY;

      // HSN Aggregation Logic
      const hsnMap = {};
      invoice.items.forEach(item => {
        const hsn = item.hsn || "N/A";
        if (!hsnMap[hsn]) {
          hsnMap[hsn] = { taxable: 0, taxVal: 0, total: 0, rate: invoice.gstRate || 18 };
        }

        const rate = parseFloat(item.rate) || 0;
        const qty = parseFloat(item.quantity) || 0;
        let subtotal = rate * qty;
        // Discount
        if (item.discountType === "percentage") subtotal -= (subtotal * (item.discount || 0)) / 100;
        else subtotal -= (item.discount || 0);

        const taxable = subtotal;
        const tax = (taxable * (invoice.gstRate || 18)) / 100;

        hsnMap[hsn].taxable += taxable;
        hsnMap[hsn].taxVal += tax;
        hsnMap[hsn].total += (taxable + tax);
      });

      const hsnRows = Object.keys(hsnMap).map(k => ({ hsn: k, ...hsnMap[k] }));

      // Table Dimensions matches visual: 4 main cols
      // Col 1: HSN (Wide)
      // Col 2: Taxable Value
      // Col 3: Integrated Tax (Sub: Rate | Amount)
      // Col 4: Total Tax Amount

      // Widths
      const col1W = 140; // HSN
      const col2W = 100; // Taxable
      const col4W = 100; // Total
      const col3W = pageWidth - col1W - col2W - col4W; // Remainder (~195)

      // Header Heights
      const hLine1Y = hsnTop;
      const hLine2Y = hsnTop + 20; // Mid line for split tax
      const hLine3Y = hsnTop + 40; // Bottom of header

      // Draw Grid Headers
      drawHLine(hLine1Y, 1);
      drawHLine(hLine3Y, 1);
      drawVLine(startX, hLine1Y, hLine3Y, 1); // Left
      drawVLine(pageRight, hLine1Y, hLine3Y, 1); // Right

      // Col Verticals (Full Header Height)
      drawVLine(startX + col1W, hLine1Y, hLine3Y, 1);
      drawVLine(startX + col1W + col2W, hLine1Y, hLine3Y, 1);
      drawVLine(pageRight - col4W, hLine1Y, hLine3Y, 1);

      // Tax Split Horizontal
      doc.lineWidth(1).strokeColor("black").moveTo(startX + col1W + col2W, hLine2Y).lineTo(pageRight - col4W, hLine2Y).stroke();
      // Tax Split Vertical
      drawVLine(startX + col1W + col2W + (col3W / 2), hLine2Y, hLine3Y, 1);

      // Header Text (Main)
      doc.font("Roboto-Bold").fontSize(8).fillColor("black");
      // Vertically center in 40px for single-row headers
      const midH = hsnTop + 14;
      doc.text("HSN/SAC", startX, midH, { width: col1W, align: "center" });
      doc.text("Taxable Value", startX + col1W, midH, { width: col2W, align: "center" });
      doc.text("Total Tax Amount", pageRight - col4W, midH, { width: col4W, align: "center" });

      // Tax Header Main (Top half)
      doc.text("Integrated Tax", startX + col1W + col2W, hsnTop + 5, { width: col3W, align: "center" });
      // Tax Header Sub (Bottom half)
      doc.text("Rate", startX + col1W + col2W, hLine2Y + 5, { width: col3W / 2, align: "center" });
      doc.text("Amount", startX + col1W + col2W + (col3W / 2), hLine2Y + 5, { width: col3W / 2, align: "center" });

      // Rows
      let rowY = hLine3Y;
      const hsnRowH = 15;

      doc.font("Roboto").fontSize(8);

      hsnRows.forEach(row => {
        drawHLine(rowY + hsnRowH, 0.5); // Thin horizontal line
        drawVLine(startX, rowY, rowY + hsnRowH, 0.5);
        drawVLine(pageRight, rowY, rowY + hsnRowH, 0.5);
        drawVLine(startX + col1W, rowY, rowY + hsnRowH, 0.5);
        drawVLine(startX + col1W + col2W, rowY, rowY + hsnRowH, 0.5);
        drawVLine(startX + col1W + col2W + (col3W / 2), rowY, rowY + hsnRowH, 0.5);
        drawVLine(pageRight - col4W, rowY, rowY + hsnRowH, 0.5);

        const py = rowY + 3;
        doc.text(row.hsn, startX, py, { width: col1W, align: "center" });
        doc.text(row.taxable.toFixed(2), startX + col1W, py, { width: col2W, align: "center" });
        doc.text(`${row.rate}%`, startX + col1W + col2W, py, { width: col3W / 2, align: "center" });
        doc.text(row.taxVal.toFixed(2), startX + col1W + col2W + (col3W / 2), py, { width: col3W / 2 - 5, align: "right" });
        doc.text(row.taxVal.toFixed(2), pageRight - col4W, py, { width: col4W, align: "center" });

        rowY += hsnRowH;
      });

      // TOTAL Row
      drawHLine(rowY + 20, 1); // Make it slightly taller
      // Verticals for total
      drawVLine(startX, rowY, rowY + 20, 1);
      drawVLine(pageRight, rowY, rowY + 20, 1);
      drawVLine(startX + col1W, rowY, rowY + 20, 1);
      drawVLine(startX + col1W + col2W, rowY, rowY + 20, 1);
      drawVLine(pageRight - col4W, rowY, rowY + 20, 1);
      // No split for Tax Rate/Amount in Total, usually just ONE amount or empty rate text?
      // Reference shows: Total Label under HSN, Total Taxable Value, Empty, Total Tax Amt, Total Tax Amt.
      // Actually reference shows: TOTAL under HSN column (aligned right), then values. AND tax rate area is blank.

      doc.font("Roboto-Bold");
      const ty = rowY + 5;
      doc.text("TOTAL", startX + col1W - 50, ty, { width: 45, align: "right" });
      doc.text(grandTotalTaxable.toFixed(2), startX + col1W, ty, { width: col2W, align: "center" });
      // Skip Rate
      doc.text(grandTotalIGST.toFixed(2), startX + col1W + col2W + (col3W / 2), ty, { width: col3W / 2 - 5, align: "right" });
      doc.text(grandTotalIGST.toFixed(2), pageRight - col4W, ty, { width: col4W, align: "center" });

      cursorY = rowY + 20;

      // --- 6. NOTES & TERMS ---
      const footerY = cursorY;
      // Box for text? Screenshot shows box around Terms.
      // Let's draw a box for the footer area.
      const footerH = 100;
      drawHLine(footerY + footerH, 1);
      drawVLine(startX, footerY, footerY + footerH, 1);
      drawVLine(pageRight, footerY, footerY + footerH, 1);

      // Vertical split for Signature (Right 1/3)
      const sigSplitX = pageRight - 180;
      drawVLine(sigSplitX, footerY, footerY + footerH, 1);

      // Left: Notes/Terms
      let fy = footerY + 5;
      const fp = startX + 5;
      doc.font("Roboto-Bold").text("Notes:", fp, fy);
      doc.font("Roboto").text("Thank you for the Business!", fp, fy + 10);

      fy += 25;
      doc.font("Roboto-Bold").text("Terms and Conditions:", fp, fy);
      doc.font("Roboto").fontSize(7)
        .text("1. Goods once sold cannot be taken back or exchanged.", fp, fy + 10)
        .text("2. We are not the manufacturers, company will stand for warranty...", fp, fy + 20)
        .text("3. Subject to local Jurisdiction.", fp, fy + 30);

      // Right: Signature
      doc.font("Roboto").fontSize(8).text(`For ${OrgDetails?.companyName || "ITC LIMITED"}`, sigSplitX + 5, footerY + 5, { align: "right", width: 170 });

      // Signature Image
      const sigY = footerY + 30; // 30px from top of footer box
      const imgX = sigSplitX + 35;
      const imgW = 100;

      if (signatureBuffer) {
        try {
          doc.image(signatureBuffer, imgX, sigY, { width: imgW, height: 40, align: 'center' });
        } catch (e) { console.error("Error drawing signature", e); }
      } else {
        // No buffer. Check if we *tried* to fetch one.
        if (sigToFetch) {
          // We tried to fetch an image but failed. Print debug info.
          doc.font("Roboto").fontSize(6).fillColor("red")
            .text(`Sig File Err: ${sigToFetch.substring(0, 50)}`, imgX, sigY, { width: imgW });
        } else {
          // Fallback text (Name)
          const txt = invoice?.signature || "Signature";

          doc.fillColor("black"); // Ensure black
          try {
            // Try using Registered Font
            if (doc._font?.name !== "SignatureFont") {
              try {
                doc.font("SignatureFont").fontSize(14).text(txt, imgX, sigY, { width: imgW, align: "center" });
              } catch (e) {
                doc.font("Roboto-Bold").fontSize(10).text(txt, imgX, sigY + 10, { width: imgW, align: "center" });
              }
            } else {
              doc.fontSize(14).text(txt, imgX, sigY, { width: imgW, align: "center" });
            }
          } catch (e) { }
        }
      }

      doc.font("Roboto").fontSize(8).text("Authorized Signatory", sigSplitX + 5, footerY + 85, { align: "right", width: 170 });

      // Page Number
      doc.text("Page 1 of 1", startX, doc.page.height - 20, { width: pageWidth, align: "center" });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};