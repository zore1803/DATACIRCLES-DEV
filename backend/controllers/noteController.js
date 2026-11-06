const { buildFuzzySearchPattern } = require('../utils/searchRegex');
const Note = require('../models/Note');
const Contact = require("../models/Contact");
const Deal = require("../models/Deal");
// CREATE Note
exports.createNote = async (req, res) => {
  try {
    const { title, note, company, deal, taggedContacts = [], taggedDeals = [], taggedInvoices = [], noteType, visibility } = req.body;
    // Optional date for the note (the calendar's Quick Add dates it to the clicked day).
    const requestedDate = req.body.createdAt ? new Date(req.body.createdAt) : null;
    const newNote = await Note.create({
      ...(requestedDate && !Number.isNaN(requestedDate.getTime()) ? { createdAt: requestedDate } : {}),
      title,
      note,
      company,
      deal: deal || undefined,
      taggedContacts,
      taggedDeals,
      taggedInvoices,
      noteType,
      visibility,
      user: req.user._id,
      organization: req.user.organization
    });

    const populatedNote = await Note.findById(newNote._id)
      .populate('taggedContacts', 'name email phone avatar')
      .populate('taggedDeals', 'title amount')
      .populate('taggedInvoices', 'invoiceNumber amount')
      .populate('company', 'name industry')
      .populate('user', 'name email profileUrl userData.mainData.profilePic');

    res.status(201).json(populatedNote);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create note', details: err.message });
  }
};


exports.createBulkNotes = async (req, res) => {
  try {
    const { title, note, companyIds, taggedContacts = [] } = req.body;

    if (!companyIds || companyIds.length === 0) {
      return res.status(400).json({ error: 'No companies selected' });
    }

    if (!note || note.trim() === '' || note === '<p><br></p>') {
      return res.status(400).json({ error: 'Note content cannot be empty' });
    }

    // Prepare the array of note documents to insert
    const notesToCreate = companyIds.map(companyId => ({
      title,
      note,
      company: companyId,
      taggedContacts,
      user: req.user._id,
      organization: req.user.organization
    }));

    // Perform bulk insert
    const createdNotes = await Note.insertMany(notesToCreate);

    res.status(201).json({
      message: `Successfully created ${createdNotes.length} notes`,
      notes: createdNotes
    });
  } catch (err) {
    console.error("Bulk note creation error:", err);
    res.status(500).json({ error: 'Failed to create bulk notes', details: err.message });
  }
};


exports.createBulkContactNotes = async (req, res) => {
  try {
    const { note, contactIds } = req.body;

    if (!contactIds || contactIds.length === 0) {
      return res.status(400).json({ error: 'No contacts selected' });
    }

    if (!note || note.trim() === '' || note === '<p><br></p>') {
      return res.status(400).json({ error: 'Note content cannot be empty' });
    }

    // 1. Fetch all selected contacts to get their company mappings
    const contacts = await Contact.find({ 
      _id: { $in: contactIds },
      organization: req.user.organization
    });

    // 2. Prepare the array of note documents to insert
    const notesToCreate = contacts.map(contact => ({
      note,
      company: contact.company || null, // Link to contact's company if it exists
      taggedContacts: [contact._id],    // Tag the specific contact
      user: req.user._id,
      organization: req.user.organization
    }));

    // 3. Perform bulk insert
    const createdNotes = await Note.insertMany(notesToCreate);

    res.status(201).json({
      message: `Successfully created ${createdNotes.length} notes`,
      notes: createdNotes
    });
  } catch (err) {
    console.error("Bulk note creation error:", err);
    res.status(500).json({ error: 'Failed to create bulk notes', details: err.message });
  }
};

// GET all notes for a company
exports.getNotesByCompany = async (req, res) => {
  try {
    const notes = await Note.find({ 
      company: req.params.companyId,
      organization: req.user.organization 
    })
      .populate('taggedContacts', 'name email phone avatar')
      .populate('user', 'name email profileUrl userData.mainData.profilePic')
      .sort({ createdAt: -1 });
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
};

// GET all notes for a contact
exports.getNotesByContact = async (req, res) => {
  try {
    const notes = await Note.find({ 
      taggedContacts: req.params.contactId,
      organization: req.user.organization 
    })
      .populate('taggedContacts', 'name email phone avatar')
      .populate('taggedDeals', 'title amount')
      .populate('taggedInvoices', 'invoiceNumber amount')
      .populate('company', 'name industry')
      .populate('user', 'name email profileUrl userData.mainData.profilePic')
      .sort({ createdAt: -1 });

    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
};

// GET all notes for a single deal
exports.getNotesByDeal = async (req, res) => {
  try {
    const notes = await Note.find({
      deal: req.params.dealId,
      organization: req.user.organization
    })
      .populate('taggedContacts', 'name email phone avatar')
      .populate('taggedDeals', 'title amount')
      .populate('taggedInvoices', 'invoiceNumber amount')
      .populate('company', 'name industry')
      .populate('user', 'name email profileUrl userData.mainData.profilePic')
      .sort({ createdAt: -1 });
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
};

// Bulk-create the same note on many deals at once. Each note is scoped to its
// deal and also records that deal's company, so company-level views still see it.
exports.createBulkDealNotes = async (req, res) => {
  try {
    const { title, note, dealIds, taggedContacts = [] } = req.body;

    if (!dealIds || dealIds.length === 0) {
      return res.status(400).json({ error: 'No deals selected' });
    }
    if (!note || note.trim() === '' || note === '<p><br></p>') {
      return res.status(400).json({ error: 'Note content cannot be empty' });
    }

    // Each note needs a company (required on the model), so resolve every
    // deal's company up front; deals without one are skipped.
    const deals = await Deal.find({
      _id: { $in: dealIds },
      organization: req.user.organization
    }).select('_id company');

    const notesToCreate = deals
      .filter((d) => d.company)
      .map((d) => ({
        title,
        note,
        deal: d._id,
        company: d.company,
        taggedContacts,
        user: req.user._id,
        organization: req.user.organization
      }));

    if (notesToCreate.length === 0) {
      return res.status(400).json({ error: 'Selected deals have no company to attach a note to' });
    }

    const createdNotes = await Note.insertMany(notesToCreate);
    res.status(201).json({
      message: `Successfully created ${createdNotes.length} notes`,
      notes: createdNotes
    });
  } catch (err) {
    console.error("Bulk deal note creation error:", err);
    res.status(500).json({ error: 'Failed to create bulk notes', details: err.message });
  }
};

// GET all notes for organization
exports.getAllNotes = async (req, res) => {
  try {
    const { search, company, limit = 50 } = req.query;
    
    let query = { organization: req.user.organization };
    
    if (search) {
      query.note = { $regex: buildFuzzySearchPattern(search), $options: 'i' };
    }
    
    if (company) {
      query.company = company;
    }
    
    const notes = await Note.find(query)
      .populate('taggedContacts', 'name email phone avatar')
      .populate('taggedDeals', 'title amount')
      .populate('taggedInvoices', 'invoiceNumber amount')
      .populate('company', 'name industry')
      .populate('user', 'name email profileUrl userData.mainData.profilePic')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
      
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
};

// GET single note
exports.getNoteById = async (req, res) => {
  try {
    const note = await Note.findOne({
      _id: req.params.id,
      organization: req.user.organization
    })
      .populate('taggedContacts', 'name email phone avatar')
      .populate('taggedDeals', 'title amount')
      .populate('taggedInvoices', 'invoiceNumber amount')
      .populate('company', 'name industry')
      .populate('user', 'name email profileUrl userData.mainData.profilePic');
      
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    res.json(note);
  } catch (err) {
    res.status(404).json({ error: 'Note not found' });
  }
};

// UPDATE note content or tags
exports.updateNote = async (req, res) => {
  try {
    const { title, note, taggedContacts, taggedDeals, taggedInvoices, noteType, visibility } = req.body;

    const updated = await Note.findOneAndUpdate(
      {
        _id: req.params.id,
        organization: req.user.organization
      },
      { title, note, taggedContacts, taggedDeals, taggedInvoices, noteType, visibility },
      { new: true }
    )
      .populate('taggedContacts', 'name email phone avatar')
      .populate('taggedDeals', 'title amount')
      .populate('taggedInvoices', 'invoiceNumber amount')
      .populate('company', 'name industry')
      .populate('user', 'name email profileUrl userData.mainData.profilePic');

    if (!updated) {
      return res.status(404).json({ error: 'Note not found' });
    }

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update note' });
  }
};

// DELETE note
exports.deleteNote = async (req, res) => {
  try {
    const deleted = await Note.findOneAndDelete({
      _id: req.params.id,
      organization: req.user.organization
    });
    
    if (!deleted) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    res.json({ message: 'Note deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete note' });
  }
};
