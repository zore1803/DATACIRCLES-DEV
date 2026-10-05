// models/Meeting.js
// const mongoose = require("mongoose");

// const meetingSchema = new mongoose.Schema(
//   {
//     // 1. Title
//     title: {
//       type: String,
//       required: true,
//       trim: true,
//     },

//     // 2. Owner (dropdown – user from the same account)
//     owner: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//       required: true,
//     },

//     // 3. Related To (polymorphic: contact, company, or vendor)
//     relatedTo: {
//       type: {
//         type: String,
//         enum: ["contact", "company", "vendor"],
//         required: true,
//       },
//       id: {
//         type: mongoose.Schema.Types.ObjectId,
//         required: true,
//         refPath: "relatedTo.type", // dynamic reference based on type
//       },
//     },

//     // 4. Where – includes meeting links and address
//     where: {
//       googleMeet: { type: Boolean, default: false },
//       zoom: { type: Boolean, default: false },
//       msTeams: { type: Boolean, default: false },
//       googleMeetLink: { type: String, trim: true },
//       zoomLink: { type: String, trim: true },
//       msTeamsLink: { type: String, trim: true },
//       address: { type: String, trim: true },
//     },

//     // 5. Starting on: date, start time, end time, reminder (minutes before)
//     startDateTime: {
//       type: Date,
//       required: true,
//     },
//     endDateTime: {
//       type: Date,
//       required: true,
//     },
//     reminderMinutes: {
//       type: Number,
//       default: 30, // e.g., 0, 5, 10, 15, 30, 60, 1440
//     },
//     timeZone: {
//       type: String,
//       default: "Asia/Kolkata", // optional but useful
//     },

//     // 6. Attendees – can be contacts, candidates, or users (polymorphic)
//     attendees: [
//       {
//         type: {
//           type: String,
//           enum: ["contact", "candidate", "user"],
//           required: true,
//         },
//         id: {
//           type: mongoose.Schema.Types.ObjectId,
//           required: true,
//           refPath: "attendees.type",
//         },
//         name: { type: String }, // denormalized for quick display
//         email: { type: String },
//       },
//     ],

//     // 7. Collaborators – other users of the same account
//     collaborators: [
//       {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "User",
//       },
//     ],

//     // 8. Create Associations – linked deals, companies, contacts, etc.
//     //    Automatically suggested based on the "relatedTo" entity.
//     associations: [
//       {
//         type: {
//           type: String,
//           enum: ["deal", "company", "contact", "task", "vendor"],
//           required: true,
//         },
//         id: {
//           type: mongoose.Schema.Types.ObjectId,
//           required: true,
//         },
//         name: { type: String }, // denormalized for display
//       },
//     ],

//     // 9. Type – custom meeting type (user‑creatable, with defaults)
//     meetingType: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "MeetingType",
//       required: true,
//     },

//     // 10. Description – rich text (HTML)
//     description: {
//       type: String, // HTML content from rich text editor
//       default: "",
//     },

//     // 11. Checkbox: create a follow‑up task
//     createFollowUpTask: {
//       type: Boolean,
//       default: false,
//     },

//     // 12. Checkbox: do not send calendar invites
//     doNotSendInvite: {
//       type: Boolean,
//       default: false,
//     },

//     // ---- System fields ----
//     createdBy: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//       required: true,
//     },
//     organization: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Organization",
//       required: true,
//     },
//   },
//   {
//     timestamps: true,
//   },
// );

// // Optional: virtual for reminder time calculation
// meetingSchema.virtual("reminderAt").get(function () {
//   if (!this.reminderMinutes) return null;
//   return new Date(this.startDateTime.getTime() - this.reminderMinutes * 60000);
// });

// // Indexes for performance
// meetingSchema.index({ organization: 1, startDateTime: -1 });
// meetingSchema.index({ "relatedTo.id": 1, organization: 1 });
// meetingSchema.index({ owner: 1, organization: 1 });
// meetingSchema.index({ attendees: 1, organization: 1 });

// module.exports = mongoose.model("Meeting", meetingSchema);


// models/Meeting.js (updated with organization field)
const mongoose = require("mongoose");

// Same shape as the other modules' additionalFields (Contact/Company/Deal/
// Vendor/Task) — key/value/type, with `type` set from the org's
// MeetingFields definition at write time (see
// services/fieldCoercionService.js).
const additionalFieldSchema = new mongoose.Schema({
  key: { type: String, required: true },
  value: mongoose.Schema.Types.Mixed,
  type: {
    type: String,
    enum: ["string", "number", "dropdown", "text", "url", "date", "multiselect"],
    default: "text",
  },
}, { _id: false });

const meetingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    scheduledAt: {
      type: Date,
      required: true,
    },
    duration: {
      type: Number, // in minutes
      default: 60,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["scheduled", "completed", "cancelled", "no-show"],
      default: "scheduled",
    },
    meetingType: {
      type: String,
      enum: ["in-person", "video-call", "phone-call"],
      default: "in-person",
    },
    meetingCategory: {
      type: String,
      default: "",
    },
    location: {
      type: String,
      trim: true,
    },

    // Flexible linking - can be linked to contact, company, or vendor
    linkedTo: {
      type: String,
      enum: ["contact", "company", "vendor"],
      required: true,
    },

    // Reference fields based on linkedTo type
    contact: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      required: function () {
        return this.linkedTo === "contact";
      },
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: function () {
        return this.linkedTo === "company";
      },
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: function () {
        return this.linkedTo === "vendor";
      },
    },

    // For company meetings, track participants — client-side contacts
    // attending, distinct from internalParticipants below (your own staff).
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Contact",
        required: function () {
          return this.linkedTo === "company";
        },
      },
    ],

    // Your own staff attending, separate from the client contacts above —
    // the Meeting Details "Internal Team" vs "Client Contacts" split relies
    // on these being two different reference collections (User vs Contact).
    internalParticipants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // Optional cross-links to other records, independent of linkedTo/contact/
    // company/vendor above — e.g. a company meeting can still reference the
    // specific contact who'll attend, or the deal/invoice it's about.
    linkedContactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
    },
    linkedDealId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deal",
    },
    linkedInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
    },

    // Meeting outcome and notes
    notes: {
      type: String,
      trim: true,
    },
    outcome: {
      type: String,
      enum: ["successful", "needs-followup", "cancelled", "no-show"],
    },

    // Reminder settings
    reminderSent: {
      type: Boolean,
      default: false,
    },
    reminderAt: {
      type: Date,
    },

    // Audit fields
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Organization field
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },

    // Users who have starred this meeting
    starredBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    additionalFields: [additionalFieldSchema],
  },
  {
    timestamps: true,
  },
);

// Updated indexes with organization
meetingSchema.index({ organization: 1, scheduledAt: 1 });
meetingSchema.index({ organization: 1, contact: 1, scheduledAt: -1 });
meetingSchema.index({ organization: 1, company: 1, scheduledAt: -1 });
meetingSchema.index({ organization: 1, vendor: 1, scheduledAt: -1 });
meetingSchema.index({ organization: 1, participants: 1, scheduledAt: -1 });
meetingSchema.index({ organization: 1, createdBy: 1, scheduledAt: -1 });
meetingSchema.index({ organization: 1, status: 1, scheduledAt: -1 });
// The deal page filters meetings by linkedDealId; every other relation was
// already indexed but this one wasn't, so it scanned the collection.
meetingSchema.index({ organization: 1, linkedDealId: 1, scheduledAt: -1 });

// Virtual for meeting end time
meetingSchema.virtual("endsAt").get(function () {
  return new Date(this.scheduledAt.getTime() + this.duration * 60000);
});

// Pre-save middleware to set reminder time (1 hour before meeting)
meetingSchema.pre("save", function (next) {
  if (this.scheduledAt && !this.reminderAt) {
    this.reminderAt = new Date(this.scheduledAt.getTime() - 60 * 60000); // 1 hour before
  }
  next();
});

module.exports = mongoose.model("Meeting", meetingSchema);