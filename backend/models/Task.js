// models/Task.js
const mongoose = require('mongoose');

// Same shape as the other modules' additionalFields (Contact/Company/Deal/
// Vendor) — key/value/type, with `type` set from the org's TaskFields
// definition at write time (see services/fieldCoercionService.js).
const additionalFieldSchema = new mongoose.Schema({
  key: { type: String, required: true },
  value: mongoose.Schema.Types.Mixed,
  type: {
    type: String,
    enum: ['string', 'number', 'dropdown', 'text', 'url', 'date', 'multiselect'],
    default: 'text',
  },
}, { _id: false });

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  dueDate: { type: Date, required: true },
  selectedDate: { type: Date, required: true },
  status: { type: String, default: 'Pending' },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },

  // Updated: Array of related entities
  relatedEntities: [{
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'relatedEntities.entityModel'
    },
    entityModel: {
      type: String,
      enum: ['Company', 'Contact', 'Deal', 'Vendor']
    }
  }],
  
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  starredBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  additionalFields: [additionalFieldSchema],
}, { timestamps: true });

// Tasks had no indexes: the Tasks list (filter by organization) and the deal/
// company/contact pages (filter by relatedEntities.entityId) both scanned the
// whole collection.
taskSchema.index({ organization: 1, createdAt: -1 });
taskSchema.index({ organization: 1, 'relatedEntities.entityId': 1 });

module.exports = mongoose.model('Task', taskSchema);
