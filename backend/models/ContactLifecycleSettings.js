// models/ContactLifecycleSettings.js
//
// Per-organization override of the contact lifecycle (stage -> statuses map),
// the DB-backed counterpart to KanbanBoard for deal statuses. Rows in this
// collection are the single source of truth once they exist — every consumer
// (Contact model validation, contactService, contactController, the frontend
// lifecycle drawer/dropdowns/Kanban) reads through here instead of the
// hardcoded default in constants/contactLifecycle.js, which now only supplies
// the seed used the first time an organization's settings are created.
const mongoose = require("mongoose");

const stageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    statuses: { type: [String], default: [] },
  },
  { _id: false }
);

const contactLifecycleSettingsSchema = new mongoose.Schema(
  {
    stages: { type: [stageSchema], default: [] },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
  },
  { timestamps: true }
);

contactLifecycleSettingsSchema.index({ organization: 1 }, { unique: true });

module.exports = mongoose.model(
  "ContactLifecycleSettings",
  contactLifecycleSettingsSchema
);
