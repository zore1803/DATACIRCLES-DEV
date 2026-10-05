// models/Deal.js
const mongoose = require("mongoose");

const additionalFieldSchema = new mongoose.Schema({
  key: { type: String, required: true },
  value: mongoose.Schema.Types.Mixed, // Can store string, number, or any value
  type: {
    type: String,
    enum: [
      "string",
      "number",
      "dropdown",
      "text",
      "url",
      "date",
      "multiselect",
    ],
    default: "text",
  },
  // 👉 ADDED: This stores the category name that this field belongs to
  category: {
    type: String,
    default: "Uncategorized"
  }
});

const dealSchema = new mongoose.Schema(
  {
    title: String,
    amount: Number,
    status: { type: String, default: "Open" },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: "Contact" },
    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    }, // ADDED BY (Immutable)
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // UPDATED BY (Mutable)
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization" },
    additionalFields: [additionalFieldSchema],
    starredBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },
);

// Hot paths: the Deals list / Dashboard filter by organization (and by user for
// staff), the company page lists a company's deals. Without these, every one of
// those queries scans the whole deals collection.
dealSchema.index({ organization: 1, createdAt: -1 });
dealSchema.index({ organization: 1, user: 1 });
dealSchema.index({ organization: 1, company: 1 });

module.exports = mongoose.model("Deal", dealSchema);