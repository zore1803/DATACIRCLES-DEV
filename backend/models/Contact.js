// models/Contact.js
const mongoose = require("mongoose");
const {
  getStageMap,
  isValidCombinationInMap,
  invalidCombinationMessageInMap,
} = require("../services/contactLifecycleService");

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
    default: 'Uncategorized' 
  }
});

const socialMediaSchema = new mongoose.Schema(
  {
    twitter: { type: String, default: "" },
    linkedin: { type: String, default: "" },
    instagram: { type: String, default: "" },
    facebook: { type: String, default: "" },
    whatsapp: { type: String, default: "" },
  },
  { _id: false },
);

const contactSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    phone: String,
    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },

    // Replace 'tag' with lifecycle stage system
    // No static `enum` here on purpose: the legal stage/status values are now
    // per-organization (ContactLifecycleSettings), not a fixed list mongoose
    // can check at schema-load time. The pre-save hook below validates the
    // pair dynamically against that organization's configured stages instead.
    lifecycleStage: {
      type: String,
      default: "Lead",
      required: true,
    },
    stageStatus: {
      type: String,
      required: true,
      default: "New",
    },

    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      default: null,
    }, // ADDED BY (Immutable)
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // UPDATED BY (Mutable)
    avatar: { type: String },
    socialMedia: {
      type: socialMediaSchema,
      default: () => ({}),
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    additionalFields: [additionalFieldSchema],
    starredBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },
);

// The enums above only check each field in isolation — this checks the PAIR,
// which is what actually matters ("Won" is a legal stageStatus but not a legal
// one for a Lead). Note this hook fires on .save() only, never on
// findOneAndUpdate — the update path is guarded separately in
// services/contactService.js, which is where the API's writes actually go.
contactSchema.pre("save", async function (next) {
  try {
    const stageMap = await getStageMap(this.organization);
    if (!isValidCombinationInMap(stageMap, this.lifecycleStage, this.stageStatus)) {
      return next(
        new Error(invalidCombinationMessageInMap(stageMap, this.lifecycleStage, this.stageStatus))
      );
    }
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model("Contact", contactSchema);