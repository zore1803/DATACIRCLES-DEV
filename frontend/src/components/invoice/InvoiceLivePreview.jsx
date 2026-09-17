import React, { useMemo } from "react";
import qrcode from "qrcode-generator";
import {
  buildDocumentHtml,
  buildUpiUri,
  DEFAULT_TEMPLATE,
} from "../../../../shared/documentTemplates.js";

/*
 * Live, on-screen render of the document the user is editing.
 *
 * The markup and styling come from shared/documentTemplates.js — the very same
 * module the backend PDF generator uses — so what's shown here is what gets
 * downloaded and emailed. This component used to reimplement the layout in JSX
 * alongside a separate PDFKit generator, and the two drifted apart (discounts
 * appearing in one and not the other, different totals, different alignment).
 * Rendering the shared fragment makes that class of bug impossible.
 *
 * Every rule in the fragment is scoped under `.dcsheet`, so injecting it here
 * can't leak styles into the surrounding app chrome.
 */
const InvoiceLivePreview = ({
  form,
  orgDetails,
  bankDetails,
  invoiceNumber,
  dealName,
  type = "tax",
  template = DEFAULT_TEMPLATE,
  supportsTax = true,
  copyType = "original",
}) => {
  const html = useMemo(() => {
    // Tax is line-item-driven: computeDocument() derives it from each item's
    // own gstRate, so the form object is passed straight through.
    const doc = { ...form };

    // Same encoder settings the PDF uses, so the preview shows the identical
    // QR the customer will scan off the printed page.
    let upiQrSvg = "";
    const uri = buildUpiUri(doc, { type, orgDetails, upiId: bankDetails?.upi });
    if (uri) {
      try {
        const qr = qrcode(0, "M");
        qr.addData(uri);
        qr.make();
        upiQrSvg = qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
      } catch {
        upiQrSvg = ""; // a missing QR shouldn't blank the whole preview
      }
    }

    return buildDocumentHtml(doc, {
      type,
      template,
      orgDetails,
      bankDetails,
      dealName,
      documentNumber: invoiceNumber,
      upiQrSvg,
      upiId: bankDetails?.upi,
      copyType,
    });
  }, [
    form,
    orgDetails,
    bankDetails,
    invoiceNumber,
    dealName,
    type,
    template,
    supportsTax,
    copyType,
  ]);

  return (
    <div
      className="bg-white shadow-lg mx-auto self-start overflow-hidden relative"
      style={{
        width: "100%",
        maxWidth: template === "Landscape" ? "297mm" : "210mm",
        minHeight: template === "Landscape" ? "210mm" : "297mm",
        border: "1px solid #ddd",
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default InvoiceLivePreview;
