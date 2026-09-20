const DocumentSettings = require('../models/DocumentSettings');
const Branding = require('../models/Branding');
const DocumentFooterTemplate = require('../models/DocumentFooterTemplate');
const DOC_TYPES = ['tax', 'performa', 'quotation', 'deliveryChallan'];
const { normalizeInvoiceNumberSettings, saveDocumentSettingsForOrganization, seedTemplateLibrariesFromLegacy, getNextNumberPreviews } = require('../utils/documentNumbering');

exports.getDocumentSettings = async (req, res) => {
  try {
    let settings = await DocumentSettings.findOne({ organization: req.user.organization }).lean();

    // First read after the template-library feature shipped: carry the org's
    // old single-slot templates forward as a named "Default" entry so nothing
    // they'd already customized disappears.
    if (settings) {
      const { changed, fields } = seedTemplateLibrariesFromLegacy(settings);
      if (changed) {
        await DocumentSettings.updateOne({ _id: settings._id }, { $set: fields });
        settings = { ...settings, ...fields };
      }
    }

    const normalized = normalizeInvoiceNumberSettings(settings || {});
    // Live, non-mutating peek at what the next number for each document type
    // will actually be (backed by the same persistent counter used at create
    // time) — the create screens use this to show the real upcoming number
    // instead of a static placeholder, and it stays in sync between the
    // split and full-width views since both read it from here.
    normalized.nextNumbers = await getNextNumberPreviews(req.user.organization);

    // Saved Notes/Terms blocks (DocumentFooterTemplate) are the newer, named
    // per-type store the Notes & Terms drawer writes to. They were never read
    // back here, so anything created in that drawer was invisible to the
    // document forms -- which kept falling back to the legacy single-string
    // settings and then to the built-in sample text. The default template for
    // a (kind, docType) now wins over the legacy string for that type;
    // anything without a template keeps the legacy value untouched.
    const footerDefaults = await DocumentFooterTemplate.find({
      organization: req.user.organization,
      isDefault: true,
      isActive: true,
    })
      .select('kind docType body')
      .lean();
    if (footerDefaults.length) {
      normalized.defaultNotesByType = { ...(normalized.defaultNotesByType || {}) };
      normalized.defaultTermsByType = { ...(normalized.defaultTermsByType || {}) };
      for (const t of footerDefaults) {
        if (typeof t.body !== 'string') continue;
        if (t.kind === 'notes') normalized.defaultNotesByType[t.docType] = t.body;
        else if (t.kind === 'terms') normalized.defaultTermsByType[t.docType] = t.body;
      }
    }

    // Attach company branding name for PDF filename generation on the frontend
    const branding = await Branding.findOne({ organization: req.user.organization }).lean();
    normalized.companyName = branding?.companyName || '';

    res.json(normalized);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/*
 * Keeps the two Notes/Terms stores in step.
 *
 * The Document Settings page writes DocumentSettings.defaultNotesByType /
 * defaultTermsByType; the Notes & Terms drawer writes named
 * DocumentFooterTemplate rows. getDocumentSettings() lets a default template
 * win for its type, so without mirroring here an edit made on the Settings
 * page would be silently overridden by an older template and look like it
 * never saved. Mirroring the saved text onto that type's default template
 * makes either surface authoritative -- whichever was edited last.
 */
async function syncFooterTemplates(organization, kind, byType) {
  if (!byType || typeof byType !== 'object') return;
  for (const [docType, body] of Object.entries(byType)) {
    if (typeof body !== 'string') continue;
    if (!DOC_TYPES.includes(docType)) continue;
    const existing = await DocumentFooterTemplate.findOne({
      organization, kind, docType, isDefault: true,
    });
    if (existing) {
      if (existing.body !== body) {
        existing.body = body;
        existing.isActive = true;
        await existing.save();
      }
      continue;
    }
    // Nothing named yet for this type: seed one so the drawer lists the same
    // text the Settings page just saved, instead of "No notes saved yet".
    if (!body.trim()) continue;
    await DocumentFooterTemplate.create({
      organization, kind, docType, title: 'Default', body, isDefault: true, isActive: true,
    });
  }
}

exports.updateDocumentSettings = async (req, res) => {
  try {
    const { invoicePrefix, invoiceSuffix, nextInvoiceNumber, documentTypeSettings, invoicePrefixes, invoiceSuffixes, defaultNotes, defaultTerms, defaultNotesByType, defaultTermsByType, defaultDueDateDays, whatsappTemplate, whatsappLine1, whatsappLine2, smsTemplate, emailSubjectTemplate, emailBodyTemplate, whatsappTemplates, smsTemplates, emailTemplates, pdfFilenameFormats } = req.body || {};
    const saved = await saveDocumentSettingsForOrganization(req.user.organization, {
      invoicePrefix,
      invoiceSuffix,
      nextInvoiceNumber,
      documentTypeSettings,
      invoicePrefixes,
      invoiceSuffixes,
      defaultNotes,
      defaultTerms,
      defaultNotesByType,
      defaultTermsByType,
      defaultDueDateDays,
      whatsappTemplate,
      whatsappLine1,
      whatsappLine2,
      smsTemplate,
      emailSubjectTemplate,
      emailBodyTemplate,
      whatsappTemplates,
      smsTemplates,
      emailTemplates,
      pdfFilenameFormats,
    });

    await syncFooterTemplates(req.user.organization, 'notes', defaultNotesByType);
    await syncFooterTemplates(req.user.organization, 'terms', defaultTermsByType);

    res.json({
      message: 'Document settings updated successfully',
      settings: normalizeInvoiceNumberSettings(saved),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getSignatures = async (req, res) => {
  try {
    const settings = await DocumentSettings.findOne({ organization: req.user.organization }).lean();
    res.json(settings?.signatures || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.saveSignature = async (req, res) => {
  try {
    const { id, name, type, dataUrl, isDefault, typedText, fontId, penColor } = req.body;
    if (!name || !type || !dataUrl) {
      return res.status(400).json({ error: 'Name, type, and signature image/data are required' });
    }

    let docSettings = await DocumentSettings.findOne({ organization: req.user.organization });
    if (!docSettings) {
      docSettings = new DocumentSettings({ organization: req.user.organization, signatures: [] });
    }

    const existingIndex = id ? docSettings.signatures.findIndex((s) => s.id === id) : -1;
    let sigResult = null;

    if (existingIndex > -1) {
      // Update existing signature
      docSettings.signatures[existingIndex].name = name;
      docSettings.signatures[existingIndex].type = type;
      docSettings.signatures[existingIndex].dataUrl = dataUrl;
      docSettings.signatures[existingIndex].typedText = typedText || '';
      docSettings.signatures[existingIndex].fontId = fontId || '';
      docSettings.signatures[existingIndex].penColor = penColor || '';

      if (isDefault) {
        docSettings.signatures.forEach((sig) => {
          sig.isDefault = false;
        });
        docSettings.signatures[existingIndex].isDefault = true;
      }
      sigResult = docSettings.signatures[existingIndex];
    } else {
      // Add new signature
      const newSig = {
        id: id || Date.now().toString(),
        name,
        type,
        dataUrl,
        typedText: typedText || '',
        fontId: fontId || '',
        penColor: penColor || '',
        isDefault: Boolean(isDefault) || docSettings.signatures.length === 0,
        createdAt: new Date(),
      };

      if (newSig.isDefault) {
        docSettings.signatures.forEach((sig) => {
          sig.isDefault = false;
        });
      }

      docSettings.signatures.push(newSig);
      sigResult = newSig;
    }

    await docSettings.save();

    res.status(200).json({ message: 'Signature saved successfully', signature: sigResult, signatures: docSettings.signatures });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteSignature = async (req, res) => {
  try {
    const { id } = req.params;
    const docSettings = await DocumentSettings.findOne({ organization: req.user.organization });
    if (!docSettings) {
      return res.status(444).json({ error: 'Document settings not found' });
    }

    const sigToDelete = docSettings.signatures.find((s) => s.id === id);
    docSettings.signatures = docSettings.signatures.filter((s) => s.id !== id);

    if (sigToDelete?.isDefault && docSettings.signatures.length > 0) {
      docSettings.signatures[0].isDefault = true;
    }

    await docSettings.save();
    res.json({ message: 'Signature deleted successfully', signatures: docSettings.signatures });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.setDefaultSignature = async (req, res) => {
  try {
    const { id } = req.params;
    const docSettings = await DocumentSettings.findOne({ organization: req.user.organization });
    if (!docSettings) {
      return res.status(404).json({ error: 'Document settings not found' });
    }

    docSettings.signatures.forEach((sig) => {
      sig.isDefault = sig.id === id;
    });

    await docSettings.save();
    res.json({ message: 'Default signature updated', signatures: docSettings.signatures });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

