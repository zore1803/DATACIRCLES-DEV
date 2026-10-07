const { buildFuzzySearchPattern } = require('../utils/searchRegex');
const Meeting = require("../models/Meeting");
const Contact = require("../models/Contact");
const Company = require("../models/Company");
const Vendor = require("../models/Vendor");
const Deal = require("../models/Deal");
const User = require("../models/User");
const sendGridMail = require("../utils/sendGridMail");
const NotificationSettings = require("../models/NotificationSettings");
const { renderEmail } = require("../utils/emailLayout");

// controllers/meetingController.js (updated createMeeting)

const MeetingType = require("../models/MeetingType");
const Task = require("../models/Task"); // for follow-up task
const { google } = require("googleapis");
const axios = require("axios");
const { isZoomConfigured, createZoomMeeting } = require("../services/zoomService");
const { processAdditionalFields } = require("../services/fieldCoercionService");
const { isGoogleConfigured, createGoogleMeetEvent } = require("../services/googleMeetService");
const { getOwnedCompanyIds } = require("../utils/ownedCompanies");
const { parseDateRangeFilter, parseAdvancedFiltersParam } = require("../utils/dateRangeFilter");

// Parses a search term as a calendar date so free-text search can match the
// "Date & Time" column, which the UI renders as D/M/YYYY (toLocaleDateString).
// Accepts "D/M/YYYY", "YYYY-MM-DD", and anything else the Date constructor
// understands; returns the UTC start/end-of-day range, or null if it isn't
// date-like.
const parseSearchAsDayRange = (search) => {
  const trimmed = (search || "").trim();
  if (!trimmed) return null;

  let date = null;
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, d, m, y] = slashMatch;
    const candidate = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (!Number.isNaN(candidate.getTime())) date = candidate;
  } else {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }

  if (!date) return null;

  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
  return { $gte: start, $lte: end };
};

// Helper function to get meeting participants' emails
const getMeetingParticipants = async (meeting) => {
  const emails = [];

  if (meeting.contact && meeting.contact.email) {
    emails.push(meeting.contact.email);
  }

  // Handle multiple participants
  if (meeting.participants && meeting.participants.length > 0) {
    meeting.participants.forEach((participant) => {
      if (participant.email) {
        emails.push(participant.email);
      }
    });
  }

  if (meeting.createdBy && meeting.createdBy.email) {
    emails.push(meeting.createdBy.email);
  }

  return [...new Set(emails)]; // Remove duplicates
};

// Helper function to format meeting details for email
const formatMeetingDetails = (meeting) => {
  const formatDate = (date) => new Date(date).toLocaleString();
  const entityName =
    meeting.contact?.name ||
    meeting.company?.name ||
    meeting.vendor?.name ||
    "Unknown";
  const entityType =
    meeting.linkedTo.charAt(0).toUpperCase() + meeting.linkedTo.slice(1);
  const participantNames =
    meeting.participants?.map((p) => p.name).join(", ") || "Not assigned";

  return {
    title: meeting.title,
    scheduledAt: formatDate(meeting.scheduledAt),
    duration: `${meeting.duration} minutes`,
    location: meeting.location || "Not specified",
    meetingType: meeting.meetingType,
    entityName,
    entityType,
    participants: participantNames,
    description: meeting.description || "No description provided",
  };
};

// Label/value rows shared by every meeting email.
const meetingDetailRows = (d, { dateLabel = "Date and time", withExtras = true } = {}) =>
  [
    { label: dateLabel, value: d.scheduledAt },
    { label: "Duration", value: d.duration },
    { label: "Location", value: d.location },
    withExtras ? { label: "Type", value: d.meetingType } : null,
    withExtras ? { label: `Related ${d.entityType}`, value: d.entityName } : null,
    withExtras ? { label: "Participants", value: d.participants } : null,
    withExtras ? { label: "Description", value: d.description } : null,
  ].filter(Boolean);

const meetingDetailText = (d, rows) =>
  rows.map((r) => `${r.label}: ${r.value}`).join("\n");

// Helper function to generate meeting creation email template
const generateMeetingCreationEmail = (meetingDetails) => {
  const rows = meetingDetailRows(meetingDetails);
  return {
    html: renderEmail({
      intro: `A meeting has been scheduled: <strong>${meetingDetails.title}</strong>. The details are below.`,
      blocks: [{ rows }],
      closingHtml: '<p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#333333;">Add it to your calendar so you have time to prepare.</p>',
      preheader: `Meeting scheduled: ${meetingDetails.title}`,
    }),
    text: `Meeting scheduled: ${meetingDetails.title}\n\n${meetingDetailText(meetingDetails, rows)}\n\nAdd it to your calendar so you have time to prepare.`,
  };
};

// Helper function to generate meeting update email template
const generateMeetingUpdateEmail = (meetingDetails, changes) => {
  const rows = meetingDetailRows(meetingDetails, { withExtras: false });
  const changeRows = Object.entries(changes).map(([key, { from, to }]) => ({
    label: key,
    value: `${from} to ${to}`,
  }));
  const changesText = changeRows.map((r) => `${r.label}: ${r.value}`).join("\n");
  return {
    html: renderEmail({
      intro: `A meeting has been updated: <strong>${meetingDetails.title}</strong>. The current details are below.`,
      blocks: [
        { rows },
        { heading: "What changed", rows: changeRows },
      ],
      closingHtml: '<p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#333333;">Update your calendar to match.</p>',
      preheader: `Meeting updated: ${meetingDetails.title}`,
    }),
    text: `Meeting updated: ${meetingDetails.title}\n\nCurrent details:\n${meetingDetailText(meetingDetails, rows)}\n\nWhat changed:\n${changesText}\n\nUpdate your calendar to match.`,
  };
};

// Helper function to generate meeting reminder email template
const generateMeetingReminderEmail = (meetingDetails) => {
  const rows = meetingDetailRows(meetingDetails, { withExtras: false });
  rows.push({ label: "Type", value: meetingDetails.meetingType });
  rows.push({ label: "Description", value: meetingDetails.description });
  return {
    html: renderEmail({
      intro: `Your meeting <strong>${meetingDetails.title}</strong> starts in about 1 hour.`,
      blocks: [{ rows }],
      closingHtml: '<p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#333333;">Prepare any materials you need for this meeting.</p>',
      preheader: `Reminder: ${meetingDetails.title} starts in 1 hour`,
    }),
    text: `Meeting reminder: starts in 1 hour\n\n${meetingDetails.title}\n${meetingDetailText(meetingDetails, rows)}\n\nPrepare any materials you need for this meeting.`,
  };
};

// Helper function to generate meeting cancellation email template
const generateMeetingCancellationEmail = (meetingDetails) => {
  const rows = meetingDetailRows(meetingDetails, { dateLabel: "Was scheduled for", withExtras: false });
  return {
    html: renderEmail({
      intro: `The meeting <strong>${meetingDetails.title}</strong> has been cancelled. You can remove it from your calendar.`,
      blocks: [{ rows }],
      preheader: `Meeting cancelled: ${meetingDetails.title}`,
    }),
    text: `Meeting cancelled: ${meetingDetails.title}\n\n${meetingDetailText(meetingDetails, rows)}\n\nThe meeting has been cancelled. You can remove it from your calendar.`,
  };
};

// A user with own-only permission may only touch meetings they created —
// shared by getMeetingsPaginated/getAllMeetings/getMeetingById/updateMeeting/
// deleteMeeting/completeMeeting. (The schema has a commented-out/unused
// `owner` field; `createdBy` is the real ownership field.) Plus: a meeting
// under a company this user OWNS (Company.owner) counts as owned too, same
// widening as contactController's isOwnedByUser — pass `ownedCompanyIds`
// (from getOwnedCompanyIds) when that broader check should apply.
const isMeetingOwnedByUser = (meeting, userId, ownedCompanyIds = []) => {
  const uid = userId.toString();
  // createdBy may be a raw ObjectId or a populated User doc, depending on
  // where this is called from.
  const createdById = meeting.createdBy?._id || meeting.createdBy;
  if (createdById?.toString() === uid) return true;

  const companyId = (meeting.company?._id ?? meeting.company)?.toString();
  return !!companyId && ownedCompanyIds.some((id) => id.toString() === companyId);
};

// Create a new meeting
exports.createMeeting = async (req, res) => {
  try {
    const {
      title,
      description,
      scheduledAt,
      duration,
      priority,
      meetingType,
      meetingCategory,
      location,
      linkedTo,
      contactId,
      companyId,
      vendorId,
      participants,
      internalParticipants,
      linkedContactId,
      linkedDealId,
      linkedInvoiceId,
      additionalFields,
    } = req.body;

    // Add the normalizeDate function (same as in createTask)
    const normalizeDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      return new Date(
        Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0)
      );
    };

    // Validate required fields based on linkedTo type
    if (linkedTo === "contact" && !contactId) {
      return res
        .status(400)
        .json({ error: "Contact ID is required for contact meetings" });
    }
    if (
      linkedTo === "company" &&
      (!companyId || !participants || participants.length === 0)
    ) {
      return res.status(400).json({
        error:
          "Company ID and at least one participant are required for company meetings",
      });
    }
    if (linkedTo === "vendor" && !vendorId) {
      return res
        .status(400)
        .json({ error: "Vendor ID is required for vendor meetings" });
    }

    // Verify the linked entity exists within the organization
    let linkedEntity;
    if (linkedTo === "contact") {
      linkedEntity = await Contact.findOne({
        _id: contactId,
        organization: req.user.organization,
      });
      if (!linkedEntity) {
        return res
          .status(404)
          .json({ error: "Contact not found in your organization" });
      }
      // Optional external participants (other contacts attending). Same
      // existence check the company branch applies to its participants.
      if (participants && participants.length > 0) {
        const participantContacts = await Contact.find({
          _id: { $in: participants },
          organization: req.user.organization,
        });
        if (participantContacts.length !== participants.length) {
          return res.status(404).json({
            error: "One or more participants not found in your organization",
          });
        }
      }
    } else if (linkedTo === "company") {
      linkedEntity = await Company.findOne({
        _id: companyId,
        organization: req.user.organization,
      });
      if (!linkedEntity) {
        return res
          .status(404)
          .json({ error: "Company not found in your organization" });
      }
      // Verify all participants exist within the organization
      const participantUsers = await Contact.find({
        _id: { $in: participants },
        organization: req.user.organization,
      });
      if (participantUsers.length !== participants.length) {
        return res.status(404).json({
          error: "One or more participants not found in your organization",
        });
      }
    } else if (linkedTo === "vendor") {
      linkedEntity = await Vendor.findOne({
        _id: vendorId,
        organization: req.user.organization,
      });
      if (!linkedEntity) {
        return res
          .status(404)
          .json({ error: "Vendor not found in your organization" });
      }
    }

    // A video-call meeting with no location set (the client didn't already
    // fill in a link, e.g. via "Generate Link") gets a real
    // Zoom or Google Meet link here, whichever is configured — same
    // priority as the generate-video-link endpoint. Failures here are
    // non-fatal — the meeting still gets created, just without a link.
    let resolvedLocation = location;
    if ((meetingType || "in-person") === "video-call" && !resolvedLocation) {
      if (isZoomConfigured()) {
        try {
          const zoomMeeting = await createZoomMeeting({
            topic: title,
            startTime: normalizeDate(scheduledAt),
            durationMinutes: duration || 60,
          });
          resolvedLocation = zoomMeeting.joinUrl;
        } catch (zoomErr) {
          console.error("Zoom meeting creation failed:", zoomErr.message);
        }
      }
      if (!resolvedLocation && isGoogleConfigured()) {
        try {
          const googleMeeting = await createGoogleMeetEvent({
            organizationId: req.user.organization,
            title,
            startTime: normalizeDate(scheduledAt),
            durationMinutes: duration || 60,
          });
          if (googleMeeting) resolvedLocation = googleMeeting.joinUrl;
        } catch (googleErr) {
          console.error("Google Meet creation failed:", googleErr.message);
        }
      }
    }

    const meetingData = {
      title,
      description,
      scheduledAt: normalizeDate(scheduledAt),
      duration: duration || 60,
      priority: priority || "medium",
      meetingType: meetingType || "in-person",
      meetingCategory: meetingCategory || "",
      location: resolvedLocation,
      linkedTo,
      createdBy: req.user.id,
      organization: req.user.organization,
      // Internal team is your own staff and is meaningful for every linked
      // type — a vendor or contact meeting can have staff attending just as
      // a company one can. Kept out of the per-type branch below so it
      // isn't silently dropped for non-company meetings.
      internalParticipants: internalParticipants || [],
      // Optional cross-links, independent of linkedTo — e.g. a company
      // meeting can still reference the specific contact attending, or the
      // deal/invoice it's about.
      linkedContactId: linkedContactId || null,
      linkedDealId: linkedDealId || null,
      linkedInvoiceId: linkedInvoiceId || null,
    };

    // Add the appropriate reference based on linkedTo type
    if (linkedTo === "contact") {
      meetingData.contact = contactId;
      if (participants && participants.length > 0) {
        meetingData.participants = participants;
      }
    } else if (linkedTo === "company") {
      meetingData.company = companyId;
      meetingData.participants = participants;
    } else if (linkedTo === "vendor") {
      meetingData.vendor = vendorId;
    }

    // Coerce against the org's MeetingFields definitions, same treatment
    // Task/Contact/Company/Vendor give their additionalFields on write.
    if (additionalFields) {
      meetingData.additionalFields = await processAdditionalFields(
        "meeting",
        additionalFields,
        req.user.organization
      );
    }

    const meeting = new Meeting(meetingData);
    await meeting.save();

    // Populate the meeting with related data
    await meeting.populate([
      { path: "contact", select: "name email phone" },
      { path: "company", select: "name industry" },
      { path: "vendor", select: "name email" },
      { path: "participants", select: "name email role" },
      { path: "internalParticipants", select: "name email" },
      { path: "createdBy", select: "name email" },
      { path: "linkedContactId", select: "name email phone" },
      { path: "linkedDealId", select: "title amount status" },
      { path: "linkedInvoiceId", select: "invoiceNumber amount status" },
    ]);

    // Gather participant IDs for notification settings check
    const participantIds = [];
    if (meeting.createdBy && meeting.createdBy._id)
      participantIds.push(meeting.createdBy._id);
    if (meeting.contact && meeting.contact._id)
      participantIds.push(meeting.contact._id);
    if (meeting.participants && meeting.participants.length > 0) {
      meeting.participants.forEach((p) => participantIds.push(p._id));
    }

    // Fetch notification settings for meeting participants with meeting notifications enabled
    const notificationUsers = await NotificationSettings.find({
      userId: { $in: participantIds },
      organization: req.user.organization,
      meetings: true,
    }).select("userId");

    const notificationUserIds = notificationUsers.map((n) =>
      n.userId.toString()
    );

    // Send meeting creation notification emails only to users with notifications enabled
    const usersData = await User.find({ _id: { $in: notificationUserIds } });

    for (const u of usersData) {
      try {
        const meetingDetails = formatMeetingDetails(meeting);
        const emailContent = generateMeetingCreationEmail(meetingDetails);

        await sendGridMail({
          to: u.email,
          subject: `Meeting scheduled: ${meetingDetails.title}`,
          text: emailContent.text,
          html: emailContent.html,
        });
      } catch (emailError) {
        console.error(
          `Failed to send creation email to ${u.email}:`,
          emailError.message
        );
      }
    }

    console.log(
      `Meeting creation emails sent to ${usersData.length} participants with notifications enabled`
    );

    res.status(201).json(meeting);
  } catch (error) {
    console.error("Error creating meeting:", error);
    res.status(500).json({ error: "Failed to create meeting" });
  }
};

// POST /meetings/generate-video-link — used by the "Generate Link" button on
// the meeting form, ahead of the meeting actually being saved. Tries Zoom
// first (if configured), then this org's connected Google account, and
// always 200s with provider: null on failure/not-configured rather than
// erroring — the frontend shows a message asking to configure a provider.
// Turns a raw googleapis/axios error into a short, user-facing reason so the
// frontend doesn't have to guess why link generation failed. Falls back to
// a generic message for anything unrecognized rather than leaking raw error
// internals to the UI.
function describeGoogleError(err) {
  const code = err?.response?.data?.error || err?.message;
  if (code === "invalid_grant") {
    return "Your Google connection has expired or was revoked. Reconnect it in Settings > Google Calendar & Meet.";
  }
  if (code === "invalid_client") {
    return "Google integration is misconfigured on this server (invalid client credentials). Contact your administrator.";
  }
  if (err?.response?.status === 403) {
    return "Google denied Calendar access for this account. Reconnect in Settings > Google Calendar & Meet and grant Calendar permission.";
  }
  return "Couldn't create a Google Meet link right now. Try reconnecting in Settings > Google Calendar & Meet.";
}

exports.generateVideoLink = async (req, res) => {
  try {
    const { title, scheduledAt, duration } = req.body;
    let errorMessage = null;

    if (isZoomConfigured()) {
      try {
        const zoomMeeting = await createZoomMeeting({
          topic: title || "Meeting",
          startTime: scheduledAt || undefined,
          durationMinutes: duration || 60,
        });
        return res.status(200).json({
          provider: "zoom",
          zoomAvailable: true, // kept for older frontend builds
          joinUrl: zoomMeeting.joinUrl,
          meetingId: zoomMeeting.meetingId,
        });
      } catch (zoomErr) {
        console.error("Error generating Zoom link:", zoomErr.message);
        errorMessage = "Couldn't create a Zoom link right now. Trying Google Meet instead…";
        // Fall through to Google Meet rather than failing outright.
      }
    }

    if (isGoogleConfigured()) {
      try {
        const googleMeeting = await createGoogleMeetEvent({
          organizationId: req.user.organization,
          title: title || "Meeting",
          startTime: scheduledAt || undefined,
          durationMinutes: duration || 60,
        });
        if (googleMeeting) {
          return res.status(200).json({
            provider: "google",
            joinUrl: googleMeeting.joinUrl,
            meetingId: googleMeeting.eventId,
          });
        }
        // googleMeeting === null means this org hasn't connected a Google
        // account yet (Settings > Integrations) — not an error, just
        // nothing to use. The frontend already has its own message for
        // this case via googleStatus, so leave errorMessage untouched.
      } catch (googleErr) {
        console.error("Error generating Google Meet link:", googleErr.message);
        errorMessage = describeGoogleError(googleErr);
      }
    }

    res.status(200).json({ provider: null, zoomAvailable: false, error: errorMessage });
  } catch (error) {
    console.error("Error generating video link:", error.message);
    res.status(200).json({ provider: null, zoomAvailable: false, error: "Couldn't generate a video-call link right now. Please try again." });
  }
};


// ---------- Helper: Generate Google Meet link (returns null if fails) ----------
// const generateGoogleMeetLink = async (title, startDateTime, endDateTime, attendeeEmails = []) => {
//   try {
//     // Check if credentials exist
//     if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
//       console.warn("⚠️ Google Calendar credentials missing. Skipping Meet link generation.");
//       return null;
//     }
//     const auth = new google.auth.JWT(
//       process.env.GOOGLE_CLIENT_EMAIL,
//       null,
//       process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
//       ["https://www.googleapis.com/auth/calendar"]
//     );
//     const calendar = google.calendar({ version: "v3", auth });
//     const event = {
//       summary: title,
//       start: { dateTime: startDateTime.toISOString() },
//       end: { dateTime: endDateTime.toISOString() },
//       conferenceData: { createRequest: { requestId: `${Date.now()}` } },
//       attendees: attendeeEmails.map(email => ({ email }))
//     };
//     const response = await calendar.events.insert({
//       calendarId: "primary",
//       conferenceDataVersion: 1,
//       resource: event
//     });
//     return response.data.hangoutLink;
//   } catch (err) {
//     console.error("Google Meet generation failed:", err.message);
//     return null;
//   }
// };

// // ---------- Helper: Generate Zoom link (returns null if fails) ----------
// const generateZoomLink = async (title, startDateTime, durationMinutes) => {
//   try {
//     if (!process.env.ZOOM_API_KEY || !process.env.ZOOM_API_SECRET) {
//       console.warn("⚠️ Zoom credentials missing. Skipping Zoom link generation.");
//       return null;
//     }
//     const jwt = require("jsonwebtoken");
//     const token = jwt.sign(
//       {
//         iss: process.env.ZOOM_API_KEY,
//         exp: Math.floor(Date.now() / 1000) + 60 * 60
//       },
//       process.env.ZOOM_API_SECRET
//     );
//     const response = await axios.post(
//       "https://api.zoom.us/v2/users/me/meetings",
//       {
//         topic: title,
//         type: 2,
//         start_time: startDateTime.toISOString(),
//         duration: Math.ceil(durationMinutes),
//         timezone: "Asia/Kolkata",
//         settings: { join_before_host: true }
//       },
//       { headers: { Authorization: `Bearer ${token}` } }
//     );
//     return response.data.join_url;
//   } catch (err) {
//     console.error("Zoom link generation failed:", err.message);
//     return null;
//   }
// };

// // ---------- Helper: Generate MS Teams link (stub) ----------
// const generateTeamsLink = async (title, startDateTime, endDateTime) => {
//   console.warn("⚠️ MS Teams link generation not implemented.");
//   return null;
// };

// // ---------- Helper: Create calendar event & send invites (stub) ----------
// const createCalendarEvent = async (meeting, attendeeEmails) => {
//   console.log(`[Calendar] Would send invites to: ${attendeeEmails.join(", ")}`);
//   return null;
// };

// // ---------- Main: Create Meeting ----------

// exports.createMeeting = async (req, res) => {
//   try {
//     const {
//       title,
//       owner,
//       linkedTo,
//       relatedEntityId,
//       activeLinkType,
//       location,
//       startDate,
//       startTime,
//       endTime,
//       reminder,
//       participants,
//       collaborators,
//       associations,
//       meetingType: meetingTypeName,
//       description,
//       doNotSendInvites,
//       createFollowUpTask,
//     } = req.body;
//     console.log(req.body)

//     // ----- 1. Basic validation -----
//     if (!title) return res.status(400).json({ error: "Title is required" });
//     if (!owner) return res.status(400).json({ error: "Owner is required" });
//     if (!linkedTo || !relatedEntityId) {
//       return res.status(400).json({ error: "Related entity is required" });
//     }
//     if (!startDate || !startTime || !endTime) {
//       return res.status(400).json({ error: "Start and end date/time are required" });
//     }

//     // ----- 2. Combine date and time -----
//     const startDateTime = new Date(`${startDate}T${startTime}:00`);
//     const endDateTime = new Date(`${startDate}T${endTime}:00`);
//     if (isNaN(startDateTime) || isNaN(endDateTime)) {
//       return res.status(400).json({ error: "Invalid date/time format" });
//     }
//     if (endDateTime <= startDateTime) {
//       return res.status(400).json({ error: "End time must be after start time" });
//     }

//     // ----- 3. Parse reminder string to minutes -----
//     let reminderMinutes = 30;
//     if (reminder) {
//       const match = reminder.match(/(\d+)/);
//       if (match) {
//         let mins = parseInt(match[1]);
//         if (reminder.includes("Hour")) mins *= 60;
//         if (reminder.includes("Day")) mins *= 1440;
//         reminderMinutes = mins;
//       }
//     }

//     // ----- 4. Verify related entity exists -----
//     let linkedEntity;
//     if (linkedTo === "contact") {
//       linkedEntity = await Contact.findOne({ _id: relatedEntityId, organization: req.user.organization });
//       if (!linkedEntity) return res.status(404).json({ error: "Contact not found" });
//     } else if (linkedTo === "company") {
//       linkedEntity = await Company.findOne({ _id: relatedEntityId, organization: req.user.organization });
//       if (!linkedEntity) return res.status(404).json({ error: "Company not found" });
//     } else if (linkedTo === "vendor") {
//       linkedEntity = await Vendor.findOne({ _id: relatedEntityId, organization: req.user.organization });
//       if (!linkedEntity) return res.status(404).json({ error: "Vendor not found" });
//     } else {
//       return res.status(400).json({ error: "Invalid linkedTo type" });
//     }

//     // ----- 5. Handle meeting type (create default types if needed) -----
//     let meetingTypeDoc = await MeetingType.findOne({ name: meetingTypeName, organization: req.user.organization });
//     if (!meetingTypeDoc) {
//       const defaultTypes = ["Business Development Meeting", "Client Check-in", "Product Demo", "Strategy Session"];
//       if (defaultTypes.includes(meetingTypeName)) {
//         meetingTypeDoc = await MeetingType.create({
//           name: meetingTypeName,
//           organization: req.user.organization,
//           isDefault: true,
//           createdBy: req.user.id,
//         });
//       } else {
//         return res.status(400).json({ error: "Invalid meeting type" });
//       }
//     }

//     // ----- 6. Build `where` object -----
//     const whereData = {
//       googleMeet: activeLinkType === "google",
//       zoom: activeLinkType === "zoom",
//       msTeams: activeLinkType === "teams",
//       googleMeetLink: "",
//       zoomLink: "",
//       msTeamsLink: "",
//       address: location || "",
//     };

//     // Auto-generate links if the platform is selected (and no link provided)
//     if (whereData.googleMeet && !whereData.googleMeetLink) {
//       const link = await generateGoogleMeetLink(title, startDateTime, endDateTime, []);
//       if (link) whereData.googleMeetLink = link;
//     }
//     if (whereData.zoom && !whereData.zoomLink) {
//       const duration = (endDateTime - startDateTime) / 60000;
//       const link = await generateZoomLink(title, startDateTime, duration);
//       if (link) whereData.zoomLink = link;
//     }
//     if (whereData.msTeams && !whereData.msTeamsLink) {
//       const link = await generateTeamsLink(title, startDateTime, endDateTime);
//       if (link) whereData.msTeamsLink = link;
//     }

//     // ----- 7. Build attendees array from participant contact IDs -----
//     const attendeesList = [];
//     if (participants && participants.length) {
//       const contactDocs = await Contact.find({ _id: { $in: participants }, organization: req.user.organization });
//       for (const contact of contactDocs) {
//         attendeesList.push({
//           type: "contact",
//           id: contact._id,
//           name: contact.name,
//           email: contact.email,
//         });
//       }
//     }

//     // ----- 8. Build associations array -----
//     const associationsList = (associations || []).map((assoc) => ({
//       type: assoc.entityModel.toLowerCase(),
//       id: assoc.entityId,
//       name: assoc.entityModel,
//     }));

//     // ----- 9. Create meeting document -----
//     const meeting = new Meeting({
//       title,
//       owner,
//       relatedTo: { type: linkedTo, id: relatedEntityId },
//       where: whereData,
//       startDateTime,
//       endDateTime,
//       reminderMinutes,
//       timeZone: "Asia/Kolkata",
//       attendees: attendeesList,
//       collaborators: collaborators || [],
//       associations: associationsList,
//       meetingType: meetingTypeDoc._id,          // ✅ NOW CORRECT
//       description: description || "",
//       createFollowUpTask: createFollowUpTask || false,
//       doNotSendInvite: doNotSendInvites || false,
//       createdBy: req.user.id,
//       organization: req.user.organization,
//     });

//     await meeting.save();
//     console.log("✅ Meeting saved with ID:", meeting._id);

//     // Populate for response
//     await meeting.populate([
//       { path: "owner", select: "name email" },
//       { path: "collaborators", select: "name email" },
//       { path: "meetingType", select: "name" },
//       { path: "createdBy", select: "name email" },
//     ]);

//     // ----- 10. Calendar invites (if not opted out) -----
//     if (!doNotSendInvites) {
//       const emails = new Set();
//       if (meeting.owner?.email) emails.add(meeting.owner.email);
//       meeting.attendees.forEach((a) => { if (a.email) emails.add(a.email); });
//       const collaboratorUsers = await User.find({ _id: { $in: meeting.collaborators } });
//       collaboratorUsers.forEach((u) => { if (u.email) emails.add(u.email); });
//       if (linkedEntity.email) emails.add(linkedEntity.email);
//       await createCalendarEvent(meeting, Array.from(emails));
//     }

//     // ----- 11. Create follow-up task if requested (FIXED for your Task model) -----
//     if (createFollowUpTask) {
//       await Task.create({
//         title: `Follow-up: ${title}`,
//         description: `Follow-up task for meeting "${title}" held on ${startDateTime.toLocaleString()}`,
//         dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
//         status: "Pending",
//         createdBy: req.user.id,
//         organization: req.user.organization,
//       });
//     }

//     res.status(201).json(meeting);
//   } catch (error) {
//     console.error("Error creating meeting:", error);
//     res.status(500).json({ error: error.message || "Failed to create meeting" });
//   }
// };

// // ---------- Endpoint: Generate meeting link on demand ----------
// exports.generateMeetingLink = async (req, res) => {
//   try {
//     const { platform, title, startDateTime, endDateTime, attendees } = req.body;
//     if (!platform || !title) {
//       return res.status(400).json({ error: "Platform and title are required" });
//     }
//     const start = startDateTime ? new Date(startDateTime) : new Date();
//     const end = endDateTime ? new Date(endDateTime) : new Date(start.getTime() + 3600000);
//     const attendeeEmails = (attendees || []).map(a => a.email).filter(Boolean);
//     let link = null;

//     if (platform === "google") {
//       link = await generateGoogleMeetLink(title, start, end, attendeeEmails);
//     } else if (platform === "zoom") {
//       const duration = (end - start) / 60000;
//       link = await generateZoomLink(title, start, duration);
//     } else if (platform === "teams") {
//       link = await generateTeamsLink(title, start, end);
//     } else {
//       return res.status(400).json({ error: "Unsupported platform" });
//     }
//     if (!link) {
//       return res.status(500).json({ error: `Failed to generate ${platform} link` });
//     }
//     res.json({ link });
//   } catch (err) {
//     console.error("Link generation error:", err);
//     res.status(500).json({ error: "Internal server error" });
//   }
// };


// Update meeting
exports.updateMeeting = async (req, res) => {
  try {
    const {
      title,
      description,
      scheduledAt,
      duration,
      priority,
      status,
      meetingType,
      meetingCategory,
      location,
      notes,
      outcome,
      participants,
      internalParticipants,
      linkedContactId,
      linkedDealId,
      linkedInvoiceId,
      additionalFields,
    } = req.body;

    const meeting = await Meeting.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });

    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    if (req.ownOnly) {
      const ownedCompanyIds = await getOwnedCompanyIds(req.user._id, req.user.organization);
      if (!isMeetingOwnedByUser(meeting, req.user._id, ownedCompanyIds)) {
        return res.status(403).json({ error: "You can only edit meetings you own" });
      }
    }

    // Store original values for comparison
    const originalScheduledAt = meeting.scheduledAt;
    const originalTitle = meeting.title;
    const originalLocation = meeting.location;
    const originalDuration = meeting.duration;
    const originalParticipants =
      meeting.participants?.map((p) => p.toString()) || [];

    // Validate participants belong to organization if updating
    if (participants && (meeting.linkedTo === "company" || meeting.linkedTo === "contact")) {
      const participantUsers = await Contact.find({
        _id: { $in: participants },
        organization: req.user.organization,
      });
      if (participantUsers.length !== participants.length) {
        return res.status(404).json({
          error: "One or more participants not found in your organization",
        });
      }
    }

    // Track changes for email notification
    const changes = {};
    if (title && title !== meeting.title) {
      changes.title = { from: meeting.title, to: title };
    }
    if (
      scheduledAt &&
      new Date(scheduledAt).getTime() !== originalScheduledAt.getTime()
    ) {
      changes.scheduledAt = {
        from: originalScheduledAt.toLocaleString(),
        to: new Date(scheduledAt).toLocaleString(),
      };
    }
    if (location && location !== meeting.location) {
      changes.location = {
        from: meeting.location || "Not specified",
        to: location,
      };
    }
    if (duration && duration !== meeting.duration) {
      changes.duration = {
        from: `${meeting.duration} minutes`,
        to: `${duration} minutes`,
      };
    }

    // Update fields
    if (title) meeting.title = title;
    if (description) meeting.description = description;
    if (scheduledAt) meeting.scheduledAt = new Date(scheduledAt);
    if (duration) meeting.duration = duration;
    if (priority) meeting.priority = priority;
    if (status) meeting.status = status;
    if (meetingType) meeting.meetingType = meetingType;
    if (meetingCategory !== undefined) meeting.meetingCategory = meetingCategory;
    if (location) meeting.location = location;
    if (notes) meeting.notes = notes;
    if (outcome) meeting.outcome = outcome;
    if (participants) meeting.participants = participants;
    if (internalParticipants) meeting.internalParticipants = internalParticipants;
    if (linkedContactId !== undefined) meeting.linkedContactId = linkedContactId || null;
    if (linkedDealId !== undefined) meeting.linkedDealId = linkedDealId || null;
    if (linkedInvoiceId !== undefined) meeting.linkedInvoiceId = linkedInvoiceId || null;
    if (additionalFields !== undefined) {
      meeting.additionalFields = await processAdditionalFields(
        "meeting",
        additionalFields,
        req.user.organization
      );
    }

    meeting.updatedBy = req.user.id;
    await meeting.save();

    // Populate and return updated meeting
    await meeting.populate([
      { path: "contact", select: "name email phone" },
      { path: "company", select: "name industry" },
      { path: "vendor", select: "name email" },
      { path: "participants", select: "name email role" },
      { path: "internalParticipants", select: "name email" },
      { path: "createdBy", select: "name email" },
      { path: "updatedBy", select: "name email" },
      { path: "linkedContactId", select: "name email phone" },
      { path: "linkedDealId", select: "title amount status" },
      { path: "linkedInvoiceId", select: "invoiceNumber amount status" },
    ]);

    // Send update notification if significant changes occurred
    if (Object.keys(changes).length > 0) {
      // Gather participant IDs for notification settings check
      const participantIds = [];
      if (meeting.createdBy && meeting.createdBy._id)
        participantIds.push(meeting.createdBy._id);
      if (meeting.contact && meeting.contact._id)
        participantIds.push(meeting.contact._id);
      if (meeting.participants && meeting.participants.length > 0) {
        meeting.participants.forEach((p) => participantIds.push(p._id));
      }

      // Fetch notification settings for meeting participants with meeting notifications enabled
      const notificationUsers = await NotificationSettings.find({
        userId: { $in: participantIds },
        organization: req.user.organization,
        meetings: true,
      }).select("userId");

      const notificationUserIds = notificationUsers.map((n) =>
        n.userId.toString()
      );
      const usersData = await User.find({ _id: { $in: notificationUserIds } });

      for (const u of usersData) {
        try {
          const meetingDetails = formatMeetingDetails(meeting);
          const emailContent = generateMeetingUpdateEmail(
            meetingDetails,
            changes
          );

          await sendGridMail({
            to: u.email,
            subject: `Meeting updated: ${meetingDetails.title}`,
            text: emailContent.text,
            html: emailContent.html,
          });
        } catch (emailError) {
          console.error(
            `Failed to send update email to ${u.email}:`,
            emailError.message
          );
        }
      }

      console.log(
        `Meeting update emails sent to ${usersData.length} participants with notifications enabled`
      );
    }

    res.json(meeting);
  } catch (error) {
    console.error("Error updating meeting:", error);
    res.status(500).json({ error: "Failed to update meeting" });
  }
};

// Delete meeting
exports.deleteMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    }).populate([
      { path: "contact", select: "name email phone" },
      { path: "company", select: "name industry" },
      { path: "vendor", select: "name email" },
      { path: "participants", select: "name email" },
      { path: "createdBy", select: "name email" },
    ]);

    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    if (req.ownOnly) {
      const ownedCompanyIds = await getOwnedCompanyIds(req.user._id, req.user.organization);
      if (!isMeetingOwnedByUser(meeting, req.user._id, ownedCompanyIds)) {
        return res.status(403).json({ error: "You can only delete meetings you own" });
      }
    }

    // Gather participant IDs for notification settings check
    const participantIds = [];
    if (meeting.createdBy && meeting.createdBy._id)
      participantIds.push(meeting.createdBy._id);
    if (meeting.contact && meeting.contact._id)
      participantIds.push(meeting.contact._id);
    if (meeting.participants && meeting.participants.length > 0) {
      meeting.participants.forEach((p) => participantIds.push(p._id));
    }

    // Fetch notification settings for meeting participants with meeting notifications enabled
    const notificationUsers = await NotificationSettings.find({
      userId: { $in: participantIds },
      organization: req.user.organization,
      meetings: true,
    }).select("userId");

    const notificationUserIds = notificationUsers.map((n) =>
      n.userId.toString()
    );
    const usersData = await User.find({ _id: { $in: notificationUserIds } });

    // Send cancellation emails before deleting
    for (const u of usersData) {
      try {
        const meetingDetails = formatMeetingDetails(meeting);
        const emailContent = generateMeetingCancellationEmail(meetingDetails);

        await sendGridMail({
          to: u.email,
          subject: `Meeting cancelled: ${meetingDetails.title}`,
          text: emailContent.text,
          html: emailContent.html,
        });
      } catch (emailError) {
        console.error(
          `Failed to send cancellation email to ${u.email}:`,
          emailError.message
        );
      }
    }

    console.log(
      `Meeting cancellation emails sent to ${usersData.length} participants with notifications enabled`
    );

    await Meeting.findByIdAndDelete(req.params.id);
    res.json({ message: "Meeting deleted successfully" });
  } catch (error) {
    console.error("Error deleting meeting:", error);
    res.status(500).json({ error: "Failed to delete meeting" });
  }
};

// Mark meeting as completed
exports.completeMeeting = async (req, res) => {
  try {
    const { notes, outcome } = req.body;

    const meeting = await Meeting.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });

    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    if (req.ownOnly) {
      const ownedCompanyIds = await getOwnedCompanyIds(req.user._id, req.user.organization);
      if (!isMeetingOwnedByUser(meeting, req.user._id, ownedCompanyIds)) {
        return res.status(403).json({ error: "You can only edit meetings you own" });
      }
    }

    meeting.status = "completed";
    meeting.notes = notes || meeting.notes;
    meeting.outcome = outcome || meeting.outcome;
    meeting.updatedBy = req.user.id;

    await meeting.save();

    await meeting.populate([
      { path: "contact", select: "name email phone" },
      { path: "company", select: "name industry" },
      { path: "vendor", select: "name email" },
      { path: "participants", select: "name email" },
      { path: "updatedBy", select: "name email" },
    ]);

    // Gather participant IDs for notification settings check
    const participantIds = [];
    if (meeting.createdBy && meeting.createdBy._id)
      participantIds.push(meeting.createdBy._id);
    if (meeting.contact && meeting.contact._id)
      participantIds.push(meeting.contact._id);
    if (meeting.participants && meeting.participants.length > 0) {
      meeting.participants.forEach((p) => participantIds.push(p._id));
    }

    // Fetch notification settings for meeting participants with meeting notifications enabled
    const notificationUsers = await NotificationSettings.find({
      userId: { $in: participantIds },
      organization: req.user.organization,
      meetings: true,
    }).select("userId");

    const notificationUserIds = notificationUsers.map((n) =>
      n.userId.toString()
    );
    const usersData = await User.find({ _id: { $in: notificationUserIds } });

    // Send completion notification
    for (const u of usersData) {
      try {
        const meetingDetails = formatMeetingDetails(meeting);

        const completedRows = [
          { label: "Meeting", value: meetingDetails.title },
          { label: "Was scheduled for", value: meetingDetails.scheduledAt },
          notes ? { label: "Notes", value: notes } : null,
          outcome ? { label: "Outcome", value: outcome } : null,
        ].filter(Boolean);

        const html = renderEmail({
          intro: `The meeting <strong>${meetingDetails.title}</strong> is marked complete.`,
          blocks: [{ rows: completedRows }],
          preheader: `Meeting completed: ${meetingDetails.title}`,
        });

        const text = `Meeting completed: ${meetingDetails.title}\n\n${completedRows.map((r) => `${r.label}: ${r.value}`).join("\n")}`;

        await sendGridMail({
          to: u.email,
          subject: `Meeting completed: ${meetingDetails.title}`,
          text,
          html,
        });
      } catch (emailError) {
        console.error(
          `Failed to send completion email to ${u.email}:`,
          emailError.message
        );
      }
    }

    console.log(
      `Meeting completion emails sent to ${usersData.length} participants with notifications enabled`
    );

    res.json(meeting);
  } catch (error) {
    console.error("Error completing meeting:", error);
    res.status(500).json({ error: "Failed to complete meeting" });
  }
};

// Send meeting reminders
exports.sendMeetingReminders = async (req, res) => {
  try {
    const oneHourFromNow = new Date();
    oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);

    const fiftyMinutesFromNow = new Date();
    fiftyMinutesFromNow.setMinutes(fiftyMinutesFromNow.getMinutes() + 50);

    const meetings = await Meeting.find({
      organization: req.user.organization,
      scheduledAt: {
        $gte: fiftyMinutesFromNow,
        $lte: oneHourFromNow,
      },
      status: "scheduled",
      reminderSent: false,
    }).populate([
      { path: "contact", select: "name email phone" },
      { path: "company", select: "name industry" },
      { path: "vendor", select: "name email" },
      { path: "participants", select: "name email" },
      { path: "createdBy", select: "name email" },
    ]);

    let remindersSent = 0;

    for (const meeting of meetings) {
      try {
        // Gather participant IDs for notification settings check
        const participantIds = [];
        if (meeting.createdBy && meeting.createdBy._id)
          participantIds.push(meeting.createdBy._id);
        if (meeting.contact && meeting.contact._id)
          participantIds.push(meeting.contact._id);
        if (meeting.participants && meeting.participants.length > 0) {
          meeting.participants.forEach((p) => participantIds.push(p._id));
        }

        // Fetch notification settings for meeting participants with meeting notifications enabled
        const notificationUsers = await NotificationSettings.find({
          userId: { $in: participantIds },
          organization: req.user.organization,
          meetings: true,
        }).select("userId");

        const notificationUserIds = notificationUsers.map((n) =>
          n.userId.toString()
        );
        const usersData = await User.find({
          _id: { $in: notificationUserIds },
        });

        const meetingDetails = formatMeetingDetails(meeting);
        const emailContent = generateMeetingReminderEmail(meetingDetails);

        // Send reminder emails to participants with notifications enabled
        for (const u of usersData) {
          try {
            await sendGridMail({
              to: u.email,
              subject: `Reminder: ${meetingDetails.title} starts in 1 hour`,
              text: emailContent.text,
              html: emailContent.html,
            });
          } catch (emailError) {
            console.error(
              `Failed to send reminder email to ${u.email}:`,
              emailError.message
            );
          }
        }

        meeting.reminderSent = true;
        await meeting.save();
        remindersSent++;
        console.log(
          `Reminder sent for meeting: ${meeting.title} to ${usersData.length} users with notifications enabled`
        );
      } catch (emailError) {
        console.error(
          `Error sending reminder for meeting ${meeting._id}:`,
          emailError
        );
      }
    }

    res.json({
      message: `${remindersSent} meeting reminders sent successfully`,
    });
  } catch (error) {
    console.error("Error sending meeting reminders:", error);
    res.status(500).json({ error: "Failed to send meeting reminders" });
  }
};

// Keep all other functions unchanged
exports.getMeetings = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      contactId,
      companyId,
      vendorId,
      dealId,
      participantId,
      status,
      search,
      page = 1,
      limit = 50,
    } = req.query;

    const query = { organization: req.user.organization };

    // Date range filter
    if (startDate || endDate) {
      query.scheduledAt = {};
      if (startDate) query.scheduledAt.$gte = new Date(startDate);
      if (endDate) query.scheduledAt.$lte = new Date(endDate);
    }

    // Entity bifurcation - verify entities belong to organization
    if (contactId) {
      const contact = await Contact.findOne({
        _id: contactId,
        organization: req.user.organization,
      });
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      query.$or = [
        { linkedTo: "contact", contact: contactId },
        { participants: contactId },
      ];
    } else if (companyId) {
      const company = await Company.findOne({
        _id: companyId,
        organization: req.user.organization,
      });
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      query.linkedTo = "company";
      query.company = companyId;
    } else if (vendorId) {
      const vendor = await Vendor.findOne({
        _id: vendorId,
        organization: req.user.organization,
      });
      if (!vendor) {
        return res.status(404).json({ error: "Vendor not found" });
      }
      query.linkedTo = "vendor";
      query.vendor = vendorId;
    } else if (dealId) {
      // A meeting is never *linked to* a deal the way it is to a company or
      // contact — a deal is recorded on the meeting's linkedDealId field. The
      // deal profile's Meetings tab asks for exactly those.
      const deal = await Deal.findOne({
        _id: dealId,
        organization: req.user.organization,
      });
      if (!deal) {
        return res.status(404).json({ error: "Deal not found" });
      }
      query.linkedDealId = dealId;
    }

    // Filter by specific participant
    if (participantId) {
      const participant = await Contact.findOne({
        _id: participantId,
        organization: req.user.organization,
      });
      if (!participant) {
        return res.status(404).json({ error: "Participant not found" });
      }
      query.participants = participantId;
    }

    // Search functionality
    if (search) {
      query.$or = [
        { title: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { description: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { location: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { notes: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
      ];
    }

    if (status) query.status = status;

    const [meetings, total] = await Promise.all([
      Meeting.find(query)
        .populate([
          { path: "contact", select: "name email phone" },
          { path: "company", select: "name industry" },
          { path: "vendor", select: "name email" },
          { path: "participants", select: "name email role" },
          { path: "internalParticipants", select: "name email" },
          { path: "createdBy", select: "name email" },
        ])
        .sort({ scheduledAt: -1 }),
      Meeting.countDocuments(query),
    ]);

    res.json({
      meetings,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    console.error("Error fetching meetings:", error);
    res.status(500).json({ error: "Failed to fetch meetings" });
  }
};

exports.getAllMeetings = async (req, res) => {
  try {
    const { search } = req.query;
    let query = { organization: req.user.organization };

    if (search) {
      query.$or = [
        { title: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { description: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { location: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
        { notes: { $regex: buildFuzzySearchPattern(search), $options: "i" } },
      ];
    }

    // own-only: restrict to meetings this user created, or meetings under a
    // company this user owns (Company.owner) — same widening as
    // contactController's list endpoints.
    if (req.ownOnly) {
      const ownedCompanyIds = await getOwnedCompanyIds(req.user._id, req.user.organization);
      const ownFilter = {
        $or: [
          { createdBy: req.user._id },
          { company: { $in: ownedCompanyIds } },
        ],
      };
      if (query.$or) {
        query = { organization: query.organization, $and: [{ $or: query.$or }, ownFilter] };
      } else {
        Object.assign(query, ownFilter);
      }
    }

    const meetings = await Meeting.find(query)
      .populate([
        { path: "contact", select: "name email phone" },
        { path: "company", select: "name industry" },
        { path: "vendor", select: "name email" },
        { path: "participants", select: "name email" },
        { path: "createdBy", select: "name email" },
      ])
      .sort({ createdAt: -1 });

    const userId = req.user._id.toString();
    const meetingsWithStar = meetings.map((meeting) => {
      const obj = meeting.toObject();
      return {
        ...obj,
        isStarred: (obj.starredBy || []).some((id) => id.toString() === userId),
      };
    });

    res.json(meetingsWithStar);
  } catch (error) {
    console.error("Error fetching meetings:", error);
    res.status(500).json({ error: "Failed to fetch meetings" });
  }
};

exports.toggleStarMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    });
    if (!meeting) return res.status(404).json({ error: "Meeting not found" });

    const userId = req.user._id.toString();
    const alreadyStarred = meeting.starredBy.some((id) => id.toString() === userId);

    if (alreadyStarred) {
      meeting.starredBy = meeting.starredBy.filter((id) => id.toString() !== userId);
    } else {
      meeting.starredBy.push(req.user._id);
    }
    await meeting.save();

    res.json({ starred: !alreadyStarred });
  } catch (error) {
    res.status(500).json({ error: "Failed to toggle star", message: error.message });
  }
};

exports.getMeetingsPaginated = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "scheduledAt",
      sortOrder = "desc",
      search,
      priority,
      status,
      user,
      scheduledAt,
      meetingType,
    } = req.query;

    // Base query with organization filter
    const query = { organization: req.user.organization };

    // Search across every column shown in the Meetings list view: title/
    // description/location/notes live on the Meeting doc itself, but the
    // "Contact" column is a populated ref, so also resolve which
    // Contacts/Companies/Vendors/Users match the term and match meetings
    // that point at any of them.
    if (search) {
      const searchRegex = { $regex: buildFuzzySearchPattern(search), $options: "i" };
      const orgFilter = { organization: req.user.organization };

      const [matchingContacts, matchingCompanies, matchingVendors, matchingUsers] =
        await Promise.all([
          Contact.find({ ...orgFilter, name: searchRegex }).select("_id"),
          Company.find({ ...orgFilter, name: searchRegex }).select("_id"),
          Vendor.find({ ...orgFilter, name: searchRegex }).select("_id"),
          User.find({ ...orgFilter, name: searchRegex }).select("_id"),
        ]);

      const contactIds = matchingContacts.map((doc) => doc._id);
      const companyIds = matchingCompanies.map((doc) => doc._id);
      const vendorIds = matchingVendors.map((doc) => doc._id);
      const userIds = matchingUsers.map((doc) => doc._id);
      const scheduledAtRange = parseSearchAsDayRange(search);

      query.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { location: searchRegex },
        { notes: searchRegex },
        { status: searchRegex },
        ...(contactIds.length ? [{ contact: { $in: contactIds } }, { participants: { $in: contactIds } }] : []),
        ...(companyIds.length ? [{ company: { $in: companyIds } }] : []),
        ...(vendorIds.length ? [{ vendor: { $in: vendorIds } }] : []),
        ...(userIds.length ? [{ createdBy: { $in: userIds } }] : []),
        ...(scheduledAtRange ? [{ scheduledAt: scheduledAtRange }] : []),
      ];
    }

    // Priority filter
    if (priority) {
      query.priority = priority;
    }

    // Status filter
    if (status) {
      query.status = status;
    }

    // Meeting type filter
    if (meetingType) {
      query.meetingType = meetingType;
    }

    // User/Participant filter
    if (user) {
      query.participants = user;
    }

    // Date filter (scheduled date)
    if (scheduledAt) {
      const date = new Date(scheduledAt);
      const nextDay = new Date(date);
      nextDay.setDate(date.getDate() + 1);
      query.scheduledAt = {
        $gte: date,
        $lt: nextDay,
      };
    }

    // Advanced filter (date presets / custom range). The browser resolves the
    // range in the user's timezone — same helper the Tasks filters use.
    const advancedRules = parseAdvancedFiltersParam(req.query.advancedFilters);
    if (advancedRules === null) {
      return res.status(400).json({ error: "Invalid advancedFilters" });
    }
    advancedRules.forEach((rule) => {
      if (!rule || rule.column !== "dueDate") return;
      const { range } = parseDateRangeFilter(rule);
      if (range) {
        query.$and = [...(query.$and || []), { scheduledAt: range }];
      }
    });

    // own-only: restrict to meetings this user created, or meetings under a
    // company this user owns (Company.owner) — same widening as
    // contactController's list endpoints.
    if (req.ownOnly) {
      const ownedCompanyIds = await getOwnedCompanyIds(req.user._id, req.user.organization);
      const ownFilter = {
        $or: [
          { createdBy: req.user._id },
          { company: { $in: ownedCompanyIds } },
        ],
      };
      query.$and = query.$and ? [...query.$and, ownFilter] : [ownFilter];
    }

    // Pagination calculations
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Sort configuration
    const sortObj = {};
    sortObj[sortBy] = sortOrder === "asc" ? 1 : -1;

    // "Select All" support: return every matching meeting's _id (ignoring
    // pagination) so the frontend can select all rows across every page,
    // not just the current page's 50.
    if (req.query.allIds === "true") {
      const allMeetings = await Meeting.find(query).select("_id").lean();
      return res.json({ ids: allMeetings.map((m) => m._id) });
    }

    // Execute query with pagination
    const [meetings, totalCount] = await Promise.all([
      Meeting.find(query)
        .populate([
          { path: "contact", select: "name email phone" },
          { path: "company", select: "name industry" },
          { path: "vendor", select: "name email" },
          { path: "participants", select: "name email" },
          { path: "createdBy", select: "name email" },
        ])
        .sort(sortObj)
        .skip(skip)
        .limit(parseInt(limit)),
      Meeting.countDocuments(query),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / parseInt(limit));
    const currentPage = parseInt(page);

    res.json({
      meetings,
      pagination: {
        currentPage,
        totalPages,
        totalCount,
        limit: parseInt(limit),
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching paginated meetings:", error);
    res.status(500).json({
      message: "Failed to fetch meetings",
      error: error.message,
    });
  }
};

exports.getMeetingById = async (req, res) => {
  try {
    const meeting = await Meeting.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    }).populate([
      { path: "contact", select: "name email phone company" },
      { path: "company", select: "name industry email phone" },
      { path: "vendor", select: "name email phone" },
      { path: "participants", select: "name email role" },
      { path: "internalParticipants", select: "name email" },
      { path: "createdBy", select: "name email" },
    ]);

    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    if (req.ownOnly) {
      const ownedCompanyIds = await getOwnedCompanyIds(req.user._id, req.user.organization);
      if (!isMeetingOwnedByUser(meeting, req.user._id, ownedCompanyIds)) {
        return res.status(403).json({ error: "You can only view meetings you own" });
      }
    }

    res.json(meeting);
  } catch (error) {
    console.error("Error fetching meeting:", error);
    res.status(500).json({ error: "Failed to fetch meeting" });
  }
};

exports.getUpcomingMeetings = async (req, res) => {
  try {
    const { days = 7, participantId } = req.query;
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + parseInt(days));

    const query = {
      organization: req.user.organization,
      scheduledAt: {
        $gte: new Date(),
        $lte: endDate,
      },
      status: "scheduled",
    };

    if (participantId) {
      const participant = await User.findOne({
        _id: participantId,
        organization: req.user.organization,
      });
      if (!participant) {
        return res.status(404).json({ error: "Participant not found" });
      }
      query.participants = participantId;
    }

    const meetings = await Meeting.find(query)
      .populate([
        { path: "contact", select: "name email phone" },
        { path: "company", select: "name" },
        { path: "vendor", select: "name" },
        { path: "participants", select: "name" },
      ])
      .sort({ scheduledAt: 1 })
      .limit(10);

    res.json(meetings);
  } catch (error) {
    console.error("Error fetching upcoming meetings:", error);
    res.status(500).json({ error: "Failed to fetch upcoming meetings" });
  }
};

exports.getMeetingsDashboard = async (req, res) => {
  try {
    let filter = { organization: req.user.organization };

    if (req.user.role === "staff") {
      filter.createdBy = req.user._id;
    }

    const meetings = await Meeting.find(filter).populate(
      "contact company vendor participants createdBy"
    );

    res.json(meetings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMeetingsByParticipant = async (req, res) => {
  try {
    const { participantId } = req.params;
    const { page = 1, limit = 50, status } = req.query;

    const participant = await User.findOne({
      _id: participantId,
      organization: req.user.organization,
    });
    if (!participant) {
      return res.status(404).json({ error: "Participant not found" });
    }

    const query = {
      organization: req.user.organization,
      participants: participantId,
    };

    if (status) query.status = status;

    const [meetings, total] = await Promise.all([
      Meeting.find(query)
        .populate([
          { path: "contact", select: "name email phone" },
          { path: "company", select: "name industry" },
          { path: "vendor", select: "name email" },
          { path: "participants", select: "name email" },
          { path: "createdBy", select: "name email" },
        ])
        .sort({ scheduledAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit),
      Meeting.countDocuments(query),
    ]);

    res.json({
      meetings,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    console.error("Error fetching meetings by participant:", error);
    res.status(500).json({ error: "Failed to fetch meetings by participant" });
  }
};
