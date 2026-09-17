const User = require("../models/User");
const Invited = require("../models/Invited");
const Organization = require("../models/Organization");
const Branding = require("../models/Branding");
const Subscription = require("../models/Subscription");
const PlanConfig = require("../models/PlanConfig");
const SubscriptionPayment = require("../models/SubscriptionPayment.js");
const KanbanBoard = require("../models/KanbanBoard");
const generateUniqueCode = require("../utils/generateUniqueCode");
const { logUserAction } = require("../utils/logger");
const razorpay = require("../config/razorpay");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const crypto = require("crypto");
const mongoose = require("mongoose");
const sendGridMail = require("../utils/sendGridMail.js");
const bcrypt = require("bcrypt");
const { getSeatStatus } = require('../utils/addonManagement');
const { getAccessEntitlementEnd } = require('../utils/prorationMath');
const { calculateInvoice } = require('../utils/invoiceEngine');
const PlanAddon = require("../models/PlanAddon");
const { startAddonPurchase } = require('../utils/addonPurchaseLifecycle');
const Notification = require("../models/Notification");
const { renderEmail } = require("../utils/emailLayout");

// Emails + writes an in-app Notification when a new staff member joins an
// organization (via invite or company code). Best-effort — callers must
// swallow rejections so this never blocks registration itself.
async function notifyAdminsOfNewStaff({ organization, staffUser }) {
  const [org, admins] = await Promise.all([
    Organization.findById(organization).select("name"),
    User.find({ organization, role: "admin" }).select("email name"),
  ]);
  if (!org) return;

  const staffName = staffUser.name || staffUser.email || staffUser.phone || "A new staff member";

  // In-app: one org-wide feed entry, same pattern the rest of the app's
  // notification bell already reads from.
  await Notification.create({
    organization,
    actorName: staffName,
    action: "created",
    entityType: "User",
    entityId: staffUser._id,
    entityLabel: staffName,
    message: `${staffName} joined ${org.name}`,
  });

  const adminEmails = admins.map((a) => a.email).filter(Boolean);
  if (adminEmails.length === 0) return;

  const staffEmail = staffUser.email || staffUser.phone || "";

  const html = renderEmail({
    intro: `<strong>${staffName}</strong>${staffEmail ? ` (${staffEmail})` : ""} has accepted their invitation and is now a member of ${org.name} on DataCircles.`,
    blocks: [
      {
        rows: [
          { label: "Team member", value: staffName },
          staffEmail ? { label: "Contact", value: staffEmail } : null,
          { label: "Organisation", value: org.name },
        ],
      },
    ],
    closingHtml: '<p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#333333;">Review or adjust what they can access from Settings &gt; User Management.</p>',
    preheader: `${staffName} has joined ${org.name} on DataCircles.`,
  });

  await sendGridMail({
    to: adminEmails,
    subject: `${staffName} has joined ${org.name}`,
    html,
  });
}
module.exports.notifyAdminsOfNewStaff = notifyAdminsOfNewStaff;

// TempOTP Model Definition
const TempOTP = mongoose.model(
  "TempOTP",
  new mongoose.Schema({
    phone: { type: String, required: true },
    otp: { type: String, required: true },
    expires: { type: Date, required: true },
    // Set once verifyPhoneChangeOtp confirms the code — the record is kept
    // (not deleted) so a later, separate "Save and Update" click can commit
    // the number without asking for the OTP again, as long as it's done
    // before `expires`.
    verified: { type: Boolean, default: false },
  }),
);

// Helper function for generating invite email HTML.
// `organizationLogoUrl` is retained for call-site compatibility; the shared
// layout uses the DataCircles logo, so it is no longer rendered.
const generateInviteEmailHTML = (
  inviteLink,
  organizationName,
  inviterName,
  organizationLogoUrl,
) => {
  return renderEmail({
    greetingName: null,
    intro: [
      `<strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> on DataCircles, the CRM the team uses to manage contacts, deals and day-to-day sales work.`,
      `Once you accept, you'll be able to work with ${organizationName}'s contacts, companies and deals, shared sales pipelines and team workflows, real-time collaboration, and reporting and analytics tools.`,
    ],
    ctaLabel: 'Accept invitation',
    ctaUrl: inviteLink,
    closingHtml: `
      <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#666666;">If the button above does not work, copy and paste this link into your browser:</p>
      <p style="margin:6px 0 0;"><a href="${inviteLink}" style="color:#1a56db;font-size:13px;word-break:break-all;">${inviteLink}</a></p>
      <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#333333;">This invitation link is unique to you. If you weren't expecting it, you can ignore this email.</p>
      <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#333333;">New to DataCircles? You can sign in with your existing Google, Facebook, GitHub, or LinkedIn account, or create an account with your phone number.</p>
    `,
    preheader: `${inviterName} has invited you to join ${organizationName} on DataCircles.`,
  });
};

// Referral invitation email. Sending this email creates NO Referral record;
// a referral only becomes Pending when the recipient actually registers
// using the link (see subscriptionController.sendReferralEmail, which calls
// this and nothing else). "Sending an email is not a referral" -- see
// backend/docs/REFERRAL_SYSTEM_DESIGN.md.
const generateReferralEmailHTML = (
  referralLink,
  organizationName,
  senderName,
  customMessage,
) => {
  const quote = customMessage
    ? `<p style="margin:0 0 16px;padding:14px 16px;background:#f4f6f8;border-left:3px solid #111111;font-size:14px;line-height:1.6;color:#333333;font-style:italic;">"${customMessage}"</p>`
    : '';

  return renderEmail({
    greetingName: null,
    intro: [
      `<strong>${senderName}</strong> from <strong>${organizationName}</strong> uses DataCircles to manage their sales and customer relationships, and thought it could be a good fit for your business.`,
      quote,
      'In DataCircles you can manage customers and deals, sales pipelines, invoices and quotations, and reports and team collaboration.',
    ],
    ctaLabel: 'See how it works',
    ctaUrl: referralLink,
    closingHtml: `
      <p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:#333333;">If you sign up and become a paying customer, both you and ${organizationName} receive a referral reward.</p>
      <p style="margin:10px 0 0;font-size:13px;line-height:1.6;color:#666666;">If the button above does not work, copy and paste this link into your browser:</p>
      <p style="margin:6px 0 0;"><a href="${referralLink}" style="color:#1a56db;font-size:13px;word-break:break-all;">${referralLink}</a></p>
      <p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#666666;">This invitation was sent by ${senderName}. If it is not relevant to you, you can ignore this email.</p>
    `,
    preheader: `${senderName} from ${organizationName} thinks DataCircles could help your team.`,
  });
};

// Get current user
exports.getCurrentUser = async (req, res) => {
  try {
    // Fetch user
    const user = req.user;
    if (req.superAdmin) {
      return res.status(200).json({
        user: req.superAdmin,
        isSuperAdmin: true,
        isTrialActive: false,
        isPaymentConfirmed: true
      });
    } // Fetch subscription for the user's organization
    const subscription = await Subscription.findOne({
      organization: user.organization,
    });
    let isTrialActive = false;
    let trialEnd = null;
    let trialUsed = null;
    let isPaymentConfirmed = false;
    if (subscription) {
      isTrialActive = subscription.isTrialActive;
      trialEnd = subscription.trialEnd;
      trialUsed = subscription.trialUsed;
      isPaymentConfirmed = subscription.isPaymentConfirmed;
    }
    // Hotfix (docs/audit/PHASE3_ENTITLEMENT_WINDOW_SCHEMA_TRACE.md §6.3, b1):
    // this used to return currentPeriodEnd directly — the ROLLING invoice
    // cycle field, not the customer's actual paid-for entitlement.
    // getAccessEntitlementEnd() returns currentPeriodEnd unchanged for
    // monthly (byte-for-byte identical response) and the real
    // anchor-relative entitlement window end for yearly.
    // Which credential this session actually authenticated with — a
    // "phone|..." JWT sub means phone is the login identity (see
    // userSyncMiddleware), everything else (Auth0 email/Google/Facebook,
    // local "password|...") logs in by email. Profile.jsx uses this to
    // decide which of email/phone is locked as the login credential and
    // which can be changed.
    const authProvider = req.auth?.sub ? req.auth.sub.split("|")[0] : null;
    const loginMethod = authProvider === "phone" || authProvider === "temp-phone" ? "phone" : "email";

    // Fetched here purely for display, e.g. the Danger Zone "type your
    // organization name to confirm" prompt — that has to match what the
    // user actually SEES as their org name (Settings > Organization
    // Details' Company Name, stored on Branding), not Organization.name,
    // which is only ever the name typed once at signup and is never shown
    // or editable anywhere in the app afterward.
    const branding = await Branding.findOne({ organization: user.organization })
      .sort({ updatedAt: -1 })
      .select("companyName");

    res.status(200).json({
      user,
      organizationName: branding?.companyName || "",
      isTrialActive,
      trialEnd,
      trialUsed,
      isPaymentConfirmed,
      appStatus: subscription?.appStatus || null,
      currentPeriodEnd: subscription ? getAccessEntitlementEnd(subscription) : null,
      loginMethod,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

// Delete user
exports.deleteUser = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (
    !user ||
    user.organization.toString() !== req.user.organization.toString()
  ) {
    return res.status(404).json({ message: "User not found" });
  }
  await logUserAction({
    organization: req.user.organization,
    performedBy: req.user._id,
    action: "user_deleted",
    targetEmail: user.email || user.profileEmail || "unknown",
    targetPermissions: user.permissions || [],
    details: {
      userId: user._id,
      name: user.name,
      role: user.role,
    },
    req,
  });

  await user.deleteOne();
  res.json({ message: "deleted successfully" });
};

// Get all users
exports.getAllUsers = async (req, res) => {
  const allUsers = await User.find(
    { organization: req.user.organization },
    { auth0Id: 0, permissions: 0, role: 0 }, // exclude fields
  );
  res.json({ allUsers });
};

exports.getAllUsersAdmin = async (req, res) => {
  const allUsers = await User.find({ organization: req.user.organization });
  res.json({ allUsers });
};

// Update profile
// Update profile
exports.updateProfile = async (req, res) => {
  try {
    const user = req.user;

    // Billing (Charge-at-Will) requires both email on the customer record,
    // but signup only ever collects one of email/phone — this lets the
    // subscription page's "Complete Billing Profile" flow fill in email if
    // missing, without touching signup/auth. Only ever fills a blank email;
    // never overwrites an existing one. Phone, unlike email, can be edited
    // from the Profile settings page even when already set.
    const { email, phone, name, changeToken } = req.body;
    if (name && name.trim()) {
      user.name = name.trim();
    }

    // A valid changeToken (from confirmCredentialChangeVerification) proves
    // this request already passed step-up verification via the OTHER,
    // linked field — used for the credential field itself (the one this
    // account actually logs in with), which is never unlocked for editing
    // without that step first. Checked once, reused for whichever of
    // email/phone it was issued for.
    let verifiedChangeField = null;
    if (changeToken) {
      try {
        const decoded = jwt.verify(changeToken, process.env.JWT_SECRET);
        if (decoded.purpose === "credential-change" && decoded.userId === user._id.toString()) {
          verifiedChangeField = decoded.field;
        }
      } catch (tokenErr) {
        return res.status(400).json({ error: "Your verification has expired. Please verify again." });
      }
    }

    if (email && !user.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Please enter a valid email address" });
      }
      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(400).json({ error: "This email is already in use." });
      }
      user.email = email;
      user.isEmailVerified = false;
    } else if (email && email.toLowerCase() !== (user.email || "").toLowerCase()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Please enter a valid email address" });
      }
      const existing = await User.findOne({ email: email.toLowerCase() });
      if (existing) {
        return res.status(400).json({ error: "This email is already in use." });
      }
      if (verifiedChangeField === "email") {
        // Step-up verified via the linked phone — no per-new-value OTP needed.
        user.email = email.toLowerCase();
        user.isEmailVerified = true;
      } else {
        // Already has an email and is changing it — unlike the first-set path
        // above, this requires the OTP sent to the new address to have been
        // confirmed first (see sendEmailChangeOtp/verifyEmailChangeOtp).
        const verifiedEmailOtp = await TempEmailOTP.findOne({
          email: email.toLowerCase(),
          verified: true,
          expires: { $gt: new Date() },
        });
        if (!verifiedEmailOtp) {
          return res.status(400).json({ error: "Please verify your new email before saving" });
        }
        await verifiedEmailOtp.deleteOne();
        user.email = email.toLowerCase();
        user.isEmailVerified = true;
      }
    }

    if (phone && phone !== user.phone) {
      if (!/^\d{10}$/.test(phone)) {
        return res.status(400).json({ error: "Please enter a valid 10-digit phone number" });
      }
      if (verifiedChangeField === "phone") {
        // Step-up verified via the linked email — no per-new-value OTP needed.
        user.phone = phone;
        user.isPhoneVerified = true;
      } else {
        // A changed phone number is only ever written here once its OTP has
        // been confirmed via verifyPhoneChangeOtp (which marks the TempOTP
        // record `verified`, but doesn't touch the user) — so "Save and
        // Update" can't silently persist a number that was typed but never
        // verified.
        const verifiedOtp = await TempOTP.findOne({
          phone,
          verified: true,
          expires: { $gt: new Date() },
        });
        if (!verifiedOtp) {
          return res.status(400).json({ error: "Please verify your new phone number before saving" });
        }
        await verifiedOtp.deleteOne();
        user.phone = phone;
        user.isPhoneVerified = true;
      }
    }

    // If a file was uploaded via multer-s3
    if (req.file && req.fileLocation) {
      // Delete old profile picture from S3 if it exists
      if (user.profileUrl && user.profileUrl.includes("cloudfront")) {
        const oldKey = user.profileUrl.split(".net/")[1]; // Extract S3 key from CloudFront URL

        if (oldKey) {
          const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
          const { s3 } = require("../middlewares/uploadMiddlewareS3");

          try {
            await s3.send(
              new DeleteObjectCommand({
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: oldKey,
              }),
            );
            console.log(`Deleted old profile picture: ${oldKey}`);
          } catch (error) {
            console.error("Error deleting old profile picture:", error);
            // Don't fail the request if deletion fails
          }
        }
      }

      user.profileUrl = req.fileLocation; // CloudFront URL set by middleware
    }

    await user.save();

    res.json({
      message: "User Profile updated",
      user,
      profileUrl: user.profileUrl,
    });
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.removeProfile = async (req, res) => {
  try {
    const user = req.user;
    if (user.profileUrl && user.profileUrl.includes("cloudfront")) {
      const oldKey = user.profileUrl.split(".net/")[1];
      if (oldKey) {
        const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
        const { s3 } = require("../middlewares/uploadMiddlewareS3");
        try {
          await s3.send(
            new DeleteObjectCommand({
              Bucket: process.env.AWS_BUCKET_NAME,
              Key: oldKey,
            }),
          );
        } catch (error) {
          console.error("Error deleting old profile picture:", error);
        }
      }
    }
    user.profileUrl = null;
    await user.save();
    res.json({ message: "Profile picture removed successfully", user });
  } catch (error) {
    console.error("Profile removal error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get profile
// exports.getProfile = async (req, res) => {
//   const user = req.user;
//   res.json(user.profileUrl);
// };

exports.getProfile = async (req, res) => {
  // Check req.user (regular user) OR req.superAdmin (super admin)
  const user = req.user || req.superAdmin;

  if (!user) {
    return res.status(401).json({ message: "User not found in request" });
  }

  res.json(user.profileUrl || null);
};

// Update permissions
exports.updatePermissions = async (req, res) => {
  const { permissions } = req.body;
  const user = await User.findOne({
    _id: req.params.id,
    organization: req.user.organization,
  });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  user.permissions = permissions;
  await user.save();
  res.json({ message: "Permissions updated", user });
};

// Invite user
exports.inviteUser = async (req, res) => {
  const { email, permissions } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const existingInvite = await Invited.findOne({
      email,
      organization: req.user.organization,
    });
    if (existingInvite) {
      return res.status(400).json({ message: "User already invited" });
    }

    // Fetch subscription and count active users
    const subscription = await Subscription.findOne({
      organization: req.user.organization,
    });

    if (!subscription) {
      return res.status(400).json({
        message:
          "No active subscription found. Please subscribe to a plan first.",
      });
    }

    // TEMPORARY HACK FOR TESTING: Allow invites during trial
    // if (subscription.isTrialActive) {
    //   return res.status(400).json({
    //     message:
    //       "Cannot invite users during trial period. Please upgrade your subscription.",
    //   });
    // }

    // Seat check via addonManagement utility
    const seatStatus = await getSeatStatus(req.user.organization);

    if (seatStatus.hasFreeStaffSeat) {
      // Seats available — proceed immediately
      await logUserAction({
        organization: req.user.organization,
        performedBy: req.user._id,
        action: "invite_sent",
        targetEmail: email,
        targetPermissions: permissions || [],
        details: { seatsAvailable: true, totalSeats: seatStatus.totalStaffSeats },
        req,
      });

      const invite = new Invited({
        email,
        permissions,
        organization: req.user.organization,
        pendingPayment: false,
      });
      await invite.save();

      const inviteLink = `${process.env.FRONTEND_URL}`;
      const org = await Organization.findById(req.user.organization);
      const html = generateInviteEmailHTML(inviteLink, org.name, req.user.name);

      // Awaited and caught. This used to be fire-and-forget: sendGridMail
      // throws on failure, so a rejected send became an unhandled rejection
      // (fatal in modern Node) while the API still answered "User invited
      // successfully" — the invite appeared under Pending Invitations and
      // nobody ever learned the mail hadn't gone out. The invite itself is
      // still valid if the mail fails, so this reports the failure rather
      // than rolling the invite back.
      let emailSent = true;
      let emailError = null;
      try {
        await sendGridMail({ to: email, subject: `${req.user.name || "A colleague"} has invited you to join ${org.name} on DataCircles`, html });
      } catch (err) {
        emailSent = false;
        emailError = err.message;
        console.error(`[inviteUser] invite email to ${email} failed:`, err.message);
      }

      return res.json({
        message: emailSent
          ? "User invited successfully"
          : "Invite created, but the email could not be sent. Share the organization code with them instead.",
        emailSent,
        emailError: emailSent ? undefined : emailError,
        seatsUsed: seatStatus.occupiedStaffSeats + 1,
        totalSeats: seatStatus.totalStaffSeats,
      });
    }

    // No free seat — this org needs to buy one more extra_seat add-on.
    // Route through the same intent -> settlement pattern as every other
    // add-on purchase (Order + webhook), instead of charging the saved card
    // synchronously. The invite itself is only created once the webhook
    // settles the payment (see handlePaymentCaptured's add-on-purchase
    // branch in subscriptionController.js).
    const { plan, subscription: seatSubscription } = seatStatus;
    const billingCycle = seatSubscription.billingCycle;

    if (seatSubscription.cancelAtPeriodEnd) {
      return res.status(400).json({
        message: "Cannot purchase add-ons when subscription is pending cancellation.",
      });
    }

    if (seatSubscription.pendingAddonAddition?.orderId) {
      return res.status(400).json({
        message: "A previous seat purchase is still pending payment. Complete or cancel it first.",
      });
    }

    const catalogEntry = await PlanAddon.findOne({ key: 'extra_seat', isActive: true });
    if (!catalogEntry) {
      return res.status(400).json({
        message: `Extra seat add-on is not configured for the "${plan.planId}" plan. Set it up in Plan Management first.`,
      });
    }
    const pricePerUnit = catalogEntry.price?.[billingCycle];
    if (!pricePerUnit) {
      return res.status(400).json({
        message: `Extra seat pricing is not configured for the "${plan.planId}" plan on the ${billingCycle} cycle.`,
      });
    }

    const result = await startAddonPurchase({
      user: req.user,
      organizationId: req.user.organization,
      subscription: seatSubscription,
      plan,
      catalogEntry: {
        ...catalogEntry,
        displayName: catalogEntry.displayName || 'Extra seat',
      },
      addonKey: 'extra_seat',
      quantity: 1,
    });

    seatSubscription.pendingAddonAddition = result.subscription.pendingAddonAddition;
    await seatSubscription.save();

    // Record intent for this invite — finalized (email sent) only when the
    // webhook settles the matching order.
    await Invited.create({
      email,
      permissions,
      organization: req.user.organization,
      pendingPayment: true,
      pendingSeatOrderId: razorpayOrder.id,
      invitedByName: req.user.name,
    });

    await logUserAction({
      organization: req.user.organization,
      performedBy: req.user._id,
      action: "invite_sent",
      targetEmail: email,
      targetPermissions: permissions || [],
      details: { requiresPayment: true, orderId: razorpayOrder.id },
      req,
    });

    return res.status(402).json({
      message: `No free seat available. An extra seat costs ₹${result.discountedProrationAmount} (pro-rated for the remaining cycle).`,
      // Split by source — see subscriptionController.js's initiateAddonPurchase
      // for why (this field used to silently mean "combined" under a
      // referral-only name).
      couponDiscountApplied: result.couponDiscountAmount || undefined,
      referralDiscountApplied: result.referralDiscountAmount || undefined,
      totalDiscountApplied: result.totalDiscountAmount || undefined,
      paymentDetails: {
        key: process.env.RAZORPAY_KEY_ID,
        order_id: result.orderId,
        amount: result.paymentDetails.amount,
        currency: 'INR',
        name: req.user.name,
        description: `Extra seat — pro-rated for remaining cycle`,
        prefill: {
          name: req.user.name,
          email: req.user.email,
          contact: req.user.phone || '',
        },
        theme: { color: '#3399cc' },
      },
    });
  } catch (error) {
    console.error("Invite error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.generateInviteEmailHTML = generateInviteEmailHTML;
exports.generateReferralEmailHTML = generateReferralEmailHTML;

// Confirm invite payment
// Get invites
exports.getInvites = async (req, res) => {
  const invites = await Invited.find({ organization: req.user.organization });
  res.json({ invites });
};

// Delete invite
exports.deleteInvite = async (req, res) => {
  const invite = await Invited.findOne({
    _id: req.params.id,
    organization: req.user.organization,
  });
  if (!invite) {
    return res.status(404).json({ message: "Invite not found" });
  }
  await logUserAction({
    organization: req.user.organization,
    performedBy: req.user._id,
    action: "invite_revoked",
    targetEmail: invite.email,
    targetPermissions: invite.permissions || [],
    details: { inviteId: invite._id },
    req,
  });
  await invite.deleteOne();
  res.json({ message: "Invitation revoked" });
};

// Send OTP
exports.sendOtp = async (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ message: "Phone is required" });
  }

  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  await TempOTP.deleteMany({ phone });
  const newOtp = new TempOTP({
    phone,
    otp,
    expires: new Date(Date.now() + 10 * 60 * 1000),
  });
  await newOtp.save();

  // Fast2SMS DLT route: the message body is the registered DLT template
  // (id 204838), not set here. Standard wording to keep registered with the
  // provider so it matches the email code (A1):
  //   "{#var#} is your DataCircles verification code. It expires in 10
  //    minutes. Do not share this code with anyone."
  const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${process.env.FAST2SMS_KEY}&route=dlt&sender_id=DTACRL&message=204838&variables_values=${otp}&flash=0&numbers=${phone}&schedule_time=`;

  try {
    const response = await axios.get(url);
    const data = await response.data;
    if (data.return) {
      res.json({ message: "OTP sent successfully" });
    } else {
      res.status(500).json({ message: "Failed to send OTP" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error sending OTP" });
  }
};

// Verify OTP
exports.verifyOtp = async (req, res) => {
  const { phone, otp } = req.body;
  const tempOtp = await TempOTP.findOne({
    phone,
    otp,
    expires: { $gt: new Date() },
  });
  if (!tempOtp) {
    return res.status(400).json({ message: "Invalid or expired OTP" });
  }
  await tempOtp.deleteOne();

  let user = await User.findOne({ phone });
  const secret = process.env.JWT_SECRET;

  if (user) {
    const token = jwt.sign(
      {
        sub: `phone|${phone}`,
        name: user.name,
        [`${process.env.AUTH0_NAMESPACE}email`]: user.profileEmail,
        [`${process.env.AUTH0_NAMESPACE}name`]: user.name,
      },
      secret,
      { expiresIn: "7d" },
    );
    return res.json({ success: true, token, user });
  } else {
    const tempToken = jwt.sign({ sub: `temp-phone|${phone}` }, secret, {
      expiresIn: "10m",
    });
    return res.status(428).json({
      error: "REGISTRATION_REQUIRED",
      message:
        "Complete registration by providing a company code to join or organization name to create a new one",
      requiresSetup: true,
      tempToken,
      provider: "phone",
    });
  }
};

// ============ EMAIL OTP FUNCTIONS (Separate from Phone OTP) ============
const TempEmailOTP = require("../models/TempEmailOTP");

// Send Email OTP
exports.sendEmailOtp = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }

  try {
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Delete any existing OTPs for this email
    await TempEmailOTP.deleteMany({ email: email.toLowerCase() });

    // Create new email OTP record
    const newEmailOtp = new TempEmailOTP({
      email: email.toLowerCase(),
      otp,
      verified: false,
      expires: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    });
    await newEmailOtp.save();

    // Send OTP via email
    const emailHtml = renderEmail({
      greetingName: null,
      intro: 'Use this code to verify your email address and finish setting up your DataCircles account:',
      blocks: [
        {
          html: `<div style="margin:20px 0;text-align:center;">
            <div style="display:inline-block;padding:16px 28px;background:#f4f6f8;border:1px solid #e5e7eb;border-radius:6px;font-size:32px;font-weight:700;letter-spacing:8px;font-family:'Courier New',monospace;color:#111111;">${otp}</div>
          </div>`,
        },
      ],
      closingHtml: '<p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#333333;">This code expires in <strong>10 minutes</strong>. If you didn\'t request it, you can ignore this email.</p>',
      preheader: 'Your DataCircles email verification code.',
    });

    console.log(otp, newEmailOtp);
    await sendGridMail({
      to: email,
      subject: "Your DataCircles verification code",
      html: emailHtml,
    });

    console.log(`✅ Email OTP sent to: ${email}`);
    res.json({
      success: true,
      message: "OTP sent successfully to your email",
    });
  } catch (error) {
    console.error("Error sending email OTP:", error);
    res.status(500).json({ message: "Error sending OTP. Please try again." });
  }
};

// Verify Email OTP
exports.verifyEmailOtp = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: "Email and OTP are required" });
  }

  try {
    // Find OTP record
    const tempEmailOtp = await TempEmailOTP.findOne({
      email: email.toLowerCase(),
      otp: otp.toString(),
      expires: { $gt: new Date() },
    });

    if (!tempEmailOtp) {
      return res.status(400).json({
        message: "Invalid or expired OTP. Please request a new one.",
      });
    }

    // Mark as verified (don't delete yet - will be deleted after registration)
    tempEmailOtp.verified = true;
    await tempEmailOtp.save();

    console.log(`✅ Email OTP verified for: ${email}`);
    res.json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (error) {
    console.error("Error verifying email OTP:", error);
    res.status(500).json({ message: "Error verifying OTP. Please try again." });
  }
};

// ============ PROFILE VERIFICATION (Settings page) ============
// Distinct from the signup-flow OTP endpoints above: these act on the
// already-authenticated req.user and flip isEmailVerified/isPhoneVerified,
// rather than looking a user up by the raw email/phone in the body.

exports.sendProfileEmailOtp = async (req, res) => {
  try {
    const user = req.user;
    if (!user.email) {
      return res.status(400).json({ error: "No email address on file to verify" });
    }
    if (user.isEmailVerified) {
      return res.status(400).json({ error: "Email is already verified" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await TempEmailOTP.deleteMany({ email: user.email.toLowerCase() });
    await new TempEmailOTP({
      email: user.email.toLowerCase(),
      otp,
      verified: false,
      expires: new Date(Date.now() + 10 * 60 * 1000),
    }).save();

    const emailHtml = renderEmail({
      greetingName: user.name,
      intro: "Use this code to verify your email address on your DataCircles account:",
      blocks: [
        {
          html: `<div style="margin:20px 0;text-align:center;">
            <div style="display:inline-block;padding:16px 28px;background:#f4f6f8;border:1px solid #e5e7eb;border-radius:6px;font-size:32px;font-weight:700;letter-spacing:8px;font-family:'Courier New',monospace;color:#111111;">${otp}</div>
          </div>`,
        },
      ],
      closingHtml: '<p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#333333;">This code expires in <strong>10 minutes</strong>. If you didn\'t request it, you can ignore this email.</p>',
      preheader: "Your DataCircles email verification code.",
    });

    await sendGridMail({
      to: user.email,
      subject: "Your DataCircles verification code",
      html: emailHtml,
    });

    res.json({ success: true, message: "OTP sent to your email" });
  } catch (error) {
    console.error("Error sending profile email OTP:", error);
    res.status(500).json({ error: "Error sending OTP. Please try again." });
  }
};

exports.verifyProfileEmailOtp = async (req, res) => {
  try {
    const user = req.user;
    const { otp } = req.body;
    if (!otp) {
      return res.status(400).json({ error: "OTP is required" });
    }

    const tempEmailOtp = await TempEmailOTP.findOne({
      email: user.email.toLowerCase(),
      otp: otp.toString(),
      expires: { $gt: new Date() },
    });
    if (!tempEmailOtp) {
      return res.status(400).json({ error: "Invalid or expired OTP. Please request a new one." });
    }
    await tempEmailOtp.deleteOne();

    user.isEmailVerified = true;
    await user.save();

    res.json({ success: true, message: "Email verified successfully", user });
  } catch (error) {
    console.error("Error verifying profile email OTP:", error);
    res.status(500).json({ error: "Error verifying OTP. Please try again." });
  }
};

// Changing to a NEW email from the Profile page (mirrors
// sendPhoneChangeOtp/verifyPhoneChangeOtp below): the address is only ever
// written to the user record once its OTP is confirmed. Mainly for
// phone-login accounts adding/changing an email that isn't their login
// credential — email/password and Auth0 accounts log in BY email, so
// changing it there is handled by updateProfile's own "!user.email" first-set
// path instead (never lets an account overwrite its own login identity
// without going through this verified flow once one is already set).
exports.sendEmailChangeOtp = async (req, res) => {
  try {
    const user = req.user;
    const { email } = req.body;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }
    const normalizedEmail = email.toLowerCase();
    if (normalizedEmail === (user.email || "").toLowerCase()) {
      return res.status(400).json({ error: "This is already your current email" });
    }
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ error: "This email is already in use." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await TempEmailOTP.deleteMany({ email: normalizedEmail });
    await new TempEmailOTP({
      email: normalizedEmail,
      otp,
      verified: false,
      expires: new Date(Date.now() + 10 * 60 * 1000),
    }).save();

    const emailHtml = renderEmail({
      greetingName: user.name,
      intro: "Use this code to verify your new email address on your DataCircles account:",
      blocks: [
        {
          html: `<div style="margin:20px 0;text-align:center;">
            <div style="display:inline-block;padding:16px 28px;background:#f4f6f8;border:1px solid #e5e7eb;border-radius:6px;font-size:32px;font-weight:700;letter-spacing:8px;font-family:'Courier New',monospace;color:#111111;">${otp}</div>
          </div>`,
        },
      ],
      closingHtml: '<p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#333333;">This code expires in <strong>10 minutes</strong>. If you didn\'t request it, you can ignore this email.</p>',
      preheader: "Your DataCircles email verification code.",
    });

    await sendGridMail({
      to: email,
      subject: "Your DataCircles verification code",
      html: emailHtml,
    });

    res.json({ success: true, message: "OTP sent to your new email" });
  } catch (error) {
    console.error("Error sending email change OTP:", error);
    res.status(500).json({ error: "Error sending OTP. Please try again." });
  }
};

// Confirms the OTP only — like verifyPhoneChangeOtp, does NOT write the
// email. That happens when "Save and Update" is clicked (updateProfile),
// which requires this verified TempEmailOTP to still exist and be unexpired.
exports.verifyEmailChangeOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required" });
    }
    const normalizedEmail = email.toLowerCase();

    const tempEmailOtp = await TempEmailOTP.findOne({
      email: normalizedEmail,
      otp: otp.toString(),
      expires: { $gt: new Date() },
    });
    if (!tempEmailOtp) {
      return res.status(400).json({ error: "Invalid or expired OTP. Please request a new one." });
    }
    tempEmailOtp.verified = true;
    await tempEmailOtp.save();

    res.json({ success: true, message: "Email verified" });
  } catch (error) {
    console.error("Error verifying email change OTP:", error);
    res.status(500).json({ error: "Error verifying OTP. Please try again." });
  }
};

// ============ CREDENTIAL CHANGE STEP-UP VERIFICATION ============
// Changing the field an account actually LOGS IN WITH (email for an
// email/Google/password account, phone for a phone-OTP account) is guarded
// differently than the other, freely-editable field above: instead of an
// OTP to the new value, we verify the request via the account's OTHER,
// already-linked contact method first — mirrors "don't have access to your
// old number? verify by email instead" patterns elsewhere, except here the
// linked channel IS the verification path, always. On success this issues a
// short-lived signed token (no DB row — nothing to clean up/expire-index)
// that updateProfile accepts in place of a per-new-value OTP when writing
// that one credential field.
exports.sendCredentialChangeVerification = async (req, res) => {
  try {
    const user = req.user;
    const { field } = req.body;
    if (field !== "email" && field !== "phone") {
      return res.status(400).json({ error: "Invalid field" });
    }
    let via = field === "phone" ? "email" : "phone";
    let destination = via === "email" ? (user.email || user.profileEmail) : user.phone;
    if (!destination) {
      // No linked field to verify through (e.g. an email-login account that
      // never added a phone) — fall back to verifying via the CURRENT value
      // of the field being changed instead (prove you own the old email/
      // phone before typing in a new one), rather than dead-ending here.
      via = field;
      destination = field === "email" ? (user.email || user.profileEmail) : user.phone;
      if (!destination) {
        return res.status(400).json({
          error: `No ${field} on file to verify this request with. Please contact support.`,
        });
      }
    }

    if (via === "email") {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      await TempEmailOTP.deleteMany({ email: destination.toLowerCase() });
      await new TempEmailOTP({
        email: destination.toLowerCase(),
        otp,
        verified: false,
        expires: new Date(Date.now() + 10 * 60 * 1000),
      }).save();

      const emailHtml = renderEmail({
        greetingName: user.name,
        intro: `Use this code to confirm your request to change your ${field} on your DataCircles account:`,
        blocks: [
          {
            html: `<div style="margin:20px 0;text-align:center;">
              <div style="display:inline-block;padding:16px 28px;background:#f4f6f8;border:1px solid #e5e7eb;border-radius:6px;font-size:32px;font-weight:700;letter-spacing:8px;font-family:'Courier New',monospace;color:#111111;">${otp}</div>
            </div>`,
          },
        ],
        closingHtml: '<p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#333333;">This code expires in <strong>10 minutes</strong>. If you didn\'t request it, you can ignore this email.</p>',
        preheader: "Your DataCircles verification code.",
      });

      await sendGridMail({
        to: destination,
        subject: "Your DataCircles verification code",
        html: emailHtml,
      });
    } else {
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      await TempOTP.deleteMany({ phone: destination });
      await new TempOTP({
        phone: destination,
        otp,
        expires: new Date(Date.now() + 10 * 60 * 1000),
      }).save();

      const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${process.env.FAST2SMS_KEY}&route=dlt&sender_id=DTACRL&message=204838&variables_values=${otp}&flash=0&numbers=${destination}&schedule_time=`;
      const response = await axios.get(url);
      if (!response.data?.return) {
        return res.status(500).json({ error: "Failed to send OTP" });
      }
    }

    const masked =
      via === "email"
        ? destination.replace(/^(.{2}).*(@.*)$/, "$1***$2")
        : destination.replace(/^(\d{2})\d+(\d{2})$/, "$1******$2");

    res.json({ success: true, via, maskedDestination: masked, message: `OTP sent to your ${via}` });
  } catch (error) {
    console.error("Error sending credential change verification:", error);
    res.status(500).json({ error: "Error sending OTP. Please try again." });
  }
};

exports.confirmCredentialChangeVerification = async (req, res) => {
  try {
    const user = req.user;
    const { field, otp } = req.body;
    if (field !== "email" && field !== "phone") {
      return res.status(400).json({ error: "Invalid field" });
    }
    if (!otp) {
      return res.status(400).json({ error: "OTP is required" });
    }
    let via = field === "phone" ? "email" : "phone";
    let destination = via === "email" ? (user.email || user.profileEmail) : user.phone;
    if (!destination) {
      // Mirrors the same fallback sendCredentialChangeVerification took.
      via = field;
      destination = field === "email" ? (user.email || user.profileEmail) : user.phone;
      if (!destination) {
        return res.status(400).json({ error: `No ${field} on file to verify this request with.` });
      }
    }

    let tempOtp;
    if (via === "email") {
      tempOtp = await TempEmailOTP.findOne({
        email: destination.toLowerCase(),
        otp: otp.toString(),
        expires: { $gt: new Date() },
      });
    } else {
      tempOtp = await TempOTP.findOne({
        phone: destination,
        otp: otp.toString(),
        expires: { $gt: new Date() },
      });
    }
    if (!tempOtp) {
      return res.status(400).json({ error: "Invalid or expired OTP. Please request a new one." });
    }
    await tempOtp.deleteOne();

    // Stateless approval: no DB row to track, just a signed claim that this
    // user verified via `via` to change `field`, good for 10 minutes —
    // updateProfile checks it instead of a per-new-value OTP when writing
    // that field.
    const changeToken = jwt.sign(
      { userId: user._id.toString(), field, purpose: "credential-change" },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );

    res.json({ success: true, changeToken });
  } catch (error) {
    console.error("Error confirming credential change verification:", error);
    res.status(500).json({ error: "Error verifying OTP. Please try again." });
  }
};

// ============ DANGER ZONE — ACCOUNT DATA REQUESTS ============
// "Reset account data" and "Delete account permanently" are NOT performed
// automatically here — both are irreversible, org-wide actions ("reset"
// wipes every company/deal/contact/etc. for the organization, "delete"
// removes the org and every user in it), so a click on the Profile page
// only ever files the request: it notifies the org's admins in-app and by
// email (mirrors notifyAdminsOfNewStaff above), and, if SUPPORT_EMAIL is
// configured, DataCircles support too. An actual admin has to act on it —
// matching the "processed within 5-7 business days" copy in the UI.
exports.submitAccountRequest = async (req, res) => {
  try {
    const user = req.user;
    const { type } = req.body;
    if (type !== "reset-data" && type !== "delete-account") {
      return res.status(400).json({ error: "Invalid request type" });
    }

    const [org, admins] = await Promise.all([
      Organization.findById(user.organization).select("name"),
      User.find({ organization: user.organization, role: "admin" }).select("email name"),
    ]);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    const requesterName = user.name || user.email || user.phone || "A user";
    const requesterContact = user.email || user.profileEmail || user.phone || "";
    const label =
      type === "reset-data"
        ? "reset all account data"
        : "permanently delete their account";
    const isDelete = type === "delete-account";

    await Notification.create({
      organization: user.organization,
      actorName: requesterName,
      // Notification.action only accepts created/updated/deleted (it's
      // meant for the change-notifier plugin's model diffs) — "created"
      // is the closest fit for a one-off request like this, same choice
      // notifyAdminsOfNewStaff makes above for a "joined" event.
      action: "created",
      entityType: "AccountRequest",
      entityId: user._id,
      entityLabel: requesterName,
      message: `${requesterName} requested to ${label} for ${org.name}`,
    });

    const adminEmails = admins.map((a) => a.email).filter(Boolean);
    const recipients = [...adminEmails];
    if (process.env.SUPPORT_EMAIL) recipients.push(process.env.SUPPORT_EMAIL);

    if (recipients.length > 0) {
      const html = renderEmail({
        intro: `<strong>${requesterName}</strong>${requesterContact ? ` (${requesterContact})` : ""} has requested to <strong>${label}</strong> for <strong>${org.name}</strong> on DataCircles.`,
        blocks: [
          {
            rows: [
              { label: "Requested by", value: requesterName },
              requesterContact ? { label: "Contact", value: requesterContact } : null,
              { label: "Organisation", value: org.name },
              { label: "Request type", value: isDelete ? "Delete account permanently" : "Reset account data" },
            ],
          },
        ],
        closingHtml: isDelete
          ? '<p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#333333;">This is irreversible — please verify the request with the organisation before acting on it. Requests are processed within 5-7 business days.</p>'
          : '<p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#333333;">This wipes all companies, deals, contacts and other records for the organisation — please verify the request before acting on it. Requests are processed within 5-7 business days.</p>',
        preheader: `${requesterName} requested to ${label} for ${org.name}.`,
      });

      await sendGridMail({
        to: recipients,
        subject: `${isDelete ? "Account deletion" : "Data reset"} request — ${org.name}`,
        html,
      });
    }

    res.json({
      success: true,
      message: "Your request has been submitted. Our team will process it within 5-7 business days.",
    });
  } catch (error) {
    console.error("Error submitting account request:", error);
    res.status(500).json({ error: "Failed to submit request. Please try again." });
  }
};

// ============ CONNECT WITH GOOGLE (Profile page) ============
// Links a Google identity to the already-logged-in account, so the SAME
// account can afterwards be signed into either with its original
// credential (password/phone) OR that Google account — this is distinct
// from Auth0 login itself, which only ever resolves ONE identity per
// request. The frontend authenticates against Auth0's google-oauth2
// connection via an isolated auth0-spa-js client (kept separate from the
// app's own Auth0Provider so it never disturbs the caller's real session),
// then hands the resulting access token here. We never trust a client-sent
// sub/email — Auth0's own /userinfo endpoint is the source of truth.
exports.linkGoogleAccount = async (req, res) => {
  try {
    const user = req.user;
    const { accessToken } = req.body;
    if (!accessToken) {
      return res.status(400).json({ error: "Missing Google authentication token" });
    }

    let profile;
    try {
      const userinfoRes = await axios.get(`https://${process.env.AUTH0_DOMAIN}/userinfo`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      profile = userinfoRes.data;
    } catch (verifyErr) {
      console.error("Failed to verify Google token via Auth0 userinfo:", verifyErr.message);
      return res.status(401).json({ error: "Could not verify your Google account. Please try again." });
    }

    const { sub, email } = profile || {};
    if (!sub || !sub.startsWith("google-oauth2|")) {
      return res.status(400).json({ error: "That doesn't look like a Google account." });
    }

    const existingByGoogle = await User.findOne({ auth0Id: sub, _id: { $ne: user._id } });
    if (existingByGoogle) {
      return res.status(400).json({ error: "This Google account is already linked to a different DataCircles account." });
    }
    if (email) {
      const existingByEmail = await User.findOne({ email: email.toLowerCase(), _id: { $ne: user._id } });
      if (existingByEmail) {
        return res.status(400).json({ error: "This Google account's email is already used by a different DataCircles account." });
      }
    }
    // The whole point of connecting Google is a second, password-free way
    // to prove you own THIS account's existing email — so if the account
    // already has one, the Google account must match it. Without this check
    // someone could link an unrelated Gmail and it'd silently become a
    // second front door into an account it has nothing to do with.
    if (user.email && email && user.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(400).json({
        error: `Please connect the Google account for ${user.email}, not ${email}.`,
      });
    }

    user.auth0Id = sub;
    // Only fills a blank email — mirrors updateProfile's own first-set path,
    // never overwrites an email this account already has.
    if (email && !user.email) {
      user.email = email.toLowerCase();
      user.isEmailVerified = true;
    }
    await user.save();

    res.json({ success: true, user, message: "Google account connected. You can now sign in with it too." });
  } catch (error) {
    console.error("Error linking Google account:", error);
    res.status(500).json({ error: "Failed to connect Google account. Please try again." });
  }
};

// Only ever clears the Google link, never the account itself — and refuses
// if Google is this account's only way to sign in (no password, no phone),
// so nobody can lock themselves out from the Profile page.
exports.unlinkGoogleAccount = async (req, res) => {
  try {
    const user = req.user;
    if (!user.auth0Id || !user.auth0Id.startsWith("google-oauth2|")) {
      return res.status(400).json({ error: "No Google account is linked" });
    }
    if (!user.password && !user.phone) {
      return res.status(400).json({
        error: "Add a phone number or set a password before disconnecting Google, so you can still sign in.",
      });
    }

    user.auth0Id = undefined;
    await user.save();

    res.json({ success: true, user, message: "Google account disconnected." });
  } catch (error) {
    console.error("Error unlinking Google account:", error);
    res.status(500).json({ error: "Failed to disconnect Google account. Please try again." });
  }
};

exports.sendProfilePhoneOtp = async (req, res) => {
  try {
    const user = req.user;
    if (!user.phone) {
      return res.status(400).json({ error: "No phone number on file to verify" });
    }
    if (user.isPhoneVerified) {
      return res.status(400).json({ error: "Phone number is already verified" });
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    await TempOTP.deleteMany({ phone: user.phone });
    await new TempOTP({
      phone: user.phone,
      otp,
      expires: new Date(Date.now() + 10 * 60 * 1000),
    }).save();

    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${process.env.FAST2SMS_KEY}&route=dlt&sender_id=DTACRL&message=204838&variables_values=${otp}&flash=0&numbers=${user.phone}&schedule_time=`;

    try {
      const response = await axios.get(url);
      if (response.data?.return) {
        return res.json({ success: true, message: "OTP sent to your phone" });
      }
      return res.status(500).json({ error: "Failed to send OTP" });
    } catch (smsError) {
      console.error("Error sending profile phone OTP:", smsError);
      return res.status(500).json({ error: "Error sending OTP" });
    }
  } catch (error) {
    console.error("Error sending profile phone OTP:", error);
    res.status(500).json({ error: "Error sending OTP. Please try again." });
  }
};

exports.verifyProfilePhoneOtp = async (req, res) => {
  try {
    const user = req.user;
    const { otp } = req.body;
    if (!otp) {
      return res.status(400).json({ error: "OTP is required" });
    }

    const tempOtp = await TempOTP.findOne({
      phone: user.phone,
      otp: otp.toString(),
      expires: { $gt: new Date() },
    });
    if (!tempOtp) {
      return res.status(400).json({ error: "Invalid or expired OTP. Please request a new one." });
    }
    await tempOtp.deleteOne();

    user.isPhoneVerified = true;
    await user.save();

    res.json({ success: true, message: "Phone number verified successfully", user });
  } catch (error) {
    console.error("Error verifying profile phone OTP:", error);
    res.status(500).json({ error: "Error verifying OTP. Please try again." });
  }
};

// Changing to a NEW phone number from the Profile page: the number is only
// ever written to the user record once the OTP sent to it is confirmed —
// sendProfilePhoneOtp/verifyProfilePhoneOtp above verify a number already on
// file, they don't gate writing a new one.
exports.sendPhoneChangeOtp = async (req, res) => {
  try {
    const user = req.user;
    const { phone } = req.body;
    if (!phone || !/^\d{10}$/.test(phone)) {
      return res.status(400).json({ error: "Please enter a valid 10-digit phone number" });
    }
    if (phone === user.phone) {
      return res.status(400).json({ error: "This is already your current phone number" });
    }
    // Phone is intentionally NOT unique across accounts (see models/User.js —
    // a shared family/office number, or one person's separate personal and
    // staff accounts, can register the same number), so no uniqueness check
    // here — only that the OTP sent to it is confirmed.

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    await TempOTP.deleteMany({ phone });
    await new TempOTP({
      phone,
      otp,
      expires: new Date(Date.now() + 10 * 60 * 1000),
    }).save();

    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${process.env.FAST2SMS_KEY}&route=dlt&sender_id=DTACRL&message=204838&variables_values=${otp}&flash=0&numbers=${phone}&schedule_time=`;

    try {
      const response = await axios.get(url);
      if (response.data?.return) {
        return res.json({ success: true, message: "OTP sent to your new phone number" });
      }
      return res.status(500).json({ error: "Failed to send OTP" });
    } catch (smsError) {
      console.error("Error sending phone change OTP:", smsError);
      return res.status(500).json({ error: "Error sending OTP" });
    }
  } catch (error) {
    console.error("Error sending phone change OTP:", error);
    res.status(500).json({ error: "Error sending OTP. Please try again." });
  }
};

// Confirms the OTP only — it does NOT write the phone number to the user
// record. That happens separately when "Save and Update" is clicked (see
// updateProfile below), which requires this verified TempOTP to still exist
// and be unexpired.
exports.verifyPhoneChangeOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ error: "Phone number and OTP are required" });
    }

    const tempOtp = await TempOTP.findOne({
      phone,
      otp: otp.toString(),
      expires: { $gt: new Date() },
    });
    if (!tempOtp) {
      return res.status(400).json({ error: "Invalid or expired OTP. Please request a new one." });
    }
    tempOtp.verified = true;
    await tempOtp.save();

    res.json({ success: true, message: "Phone number verified" });
  } catch (error) {
    console.error("Error verifying phone change OTP:", error);
    res.status(500).json({ error: "Error verifying OTP. Please try again." });
  }
};

// Complete registration
exports.completeRegistration = async (req, res) => {
  try {
    let sub = req.auth.sub;
    let provider = sub.split("|")[0];
    const namespace = process.env.AUTH0_NAMESPACE;
    let email = req.auth[`${namespace}email`] || req.auth.email || req.body.email;
    let name = req.auth[`${namespace}name`] || req.auth.name || req.body.name || null;
    let phone;

    if (provider === "temp-phone") {
      provider = "phone";
      phone = sub.split("|")[1];
      email = req.body.email; // profileEmail
      name = req.body.name || null;
      if (!email) {
        return res.status(400).json({
          error: "EMAIL_REQUIRED",
          message: "Valid email required",
          requiresEmail: true,
          provider: "phone",
          name,
        });
      }

      // ✅ Check if email OTP is verified ONLY when email is being newly provided
      // (not when user is submitting company code/org name in setup form)
      const isProvidingOrgDetails = req.body.code || req.body.orgName;

      if (!isProvidingOrgDetails) {
        // User is in phone profile input form - check email verification
        const emailOtpRecord = await TempEmailOTP.findOne({
          email: email.toLowerCase(),
          verified: true,
          expires: { $gt: new Date() },
        });

        if (!emailOtpRecord) {
          return res.status(400).json({
            error: "EMAIL_NOT_VERIFIED",
            message: "Email not verified. Please verify your email first.",
            requiresEmailVerification: true,
          });
        }

        // Delete the email OTP record after successful verification check
        await TempEmailOTP.deleteMany({ email: email.toLowerCase() });
      }
    }

    // Look up user by auth0Id (sub) first, then by email for non-Facebook/Phone providers, or by phone
    let user = await User.findOne({ auth0Id: sub });
    if (!user && provider !== "facebook" && provider !== "phone" && email) {
  user = await User.findOne({ email });
} else if (!user && provider === "phone") {
      user = await User.findOne({ phone });
    }

    if (user) {
      let updated = false;
      if (!user.auth0Id && provider !== "phone") {
        user.auth0Id = sub;
        updated = true;
      }
      if (provider === "facebook" && email && user.email !== email) {
        const emailTaken = await User.findOne({
          email,
          auth0Id: { $ne: sub },
        });
        if (emailTaken) {
          return res
            .status(400)
            .json({ message: "This email is already registered" });
        }
        user.email = email;
        updated = true;
      }
      if (provider === "phone" && email && user.profileEmail !== email) {
        const emailTaken = await User.findOne({
          profileEmail: email,
          phone: { $ne: phone },
        });
        if (emailTaken) {
          return res
            .status(400)
            .json({ message: "This email is already registered" });
        }
        user.profileEmail = email;
        updated = true;
      }
      if (name && user.name !== name) {
        user.name = name;
        updated = true;
      }
      if (updated) await user.save();
      const token =
        provider === "phone"
          ? jwt.sign(
            {
              sub: `phone|${user.phone}`,
              name: user.name,
              [`${namespace}email`]: user.profileEmail,
              [`${namespace}name`]: user.name,
            },
            process.env.JWT_SECRET,
            { expiresIn: "7d" },
          )
          : null;
      return res.json({ success: true, user, token });
    }

    // Check for invited user by email (or profileEmail for phone)
    let organization;
    let role = "staff";
    let permissions = [];
    let joinMethod = null; // Track how the user is joining

    const inviteEmail = provider === "phone" ? email : email;
    const invited = await Invited.findOne({ email: inviteEmail });

    if (invited && invited.pendingPayment) {
      return res.status(402).json({
        message: "Your invite is waiting on a seat purchase to complete. Ask your admin to finish payment, then try again.",
      });
    }

    if (invited) {
      // User was invited - no seat limit check needed as invite already validated seats
      organization = invited.organization;
      permissions = invited.permissions || [];
      joinMethod = "invite";
      await Invited.deleteOne({ _id: invited._id });
    } else if (req.body.code) {
      // User is joining via company code - MUST check seat limits
      // Trimmed and case-insensitive: codes get copy-pasted out of chat and
      // email, which picks up whitespace, and reset-code emits lowercase hex
      // while older codes are uppercase — an exact match rejected a code the
      // user had typed correctly. Anchored + escaped so it stays an exact
      // comparison, not a substring one.
      const rawCode = String(req.body.code || "").trim();
      const escaped = rawCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const org = await Organization.findOne({
        code: new RegExp("^" + escaped + "$", "i"),
      });
      if (!org) {
        return res.status(400).json({ message: "Invalid company code" });
      }

      // CRITICAL: Check seat limit for code joins
      const subscription = await Subscription.findOne({
        organization: org._id,
      });

      if (subscription) {
        const seatStatus = await getSeatStatus(org._id);

        console.log(
          `Code join attempt - Organization: ${org.name}, Staff occupied: ${seatStatus.occupiedStaffSeats}, Total staff seats: ${seatStatus.totalStaffSeats} (${seatStatus.staffSeatsIncluded} included + ${seatStatus.extraSeatsOwned} extra)`,
        );

        if (!seatStatus.hasFreeStaffSeat) {
          return res.status(403).json({
            message:
              "This organization has reached its user limit. Please contact your admin to purchase more seats.",
            seatsUsed: seatStatus.occupiedStaffSeats,
            totalSeats: seatStatus.totalStaffSeats,
            joinMethod: "code",
          });
        }
      }

      organization = org._id;
      joinMethod = "code";
      permissions = [
        { name: "Companies", permission: "read-write" },
        { name: "Deals", permission: "read-write" },
        { name: "Contacts", permission: "read-write" },
        { name: "Invoices", permission: "read-write" },
        { name: "Tasks", permission: "read-write" },
        { name: "Vendors", permission: "read-write" },
        { name: "purchases", permission: "read-write" },
        { name: "purchase-orders", permission: "read-write" },
        { name: "Items", permission: "read-write" },
        { name: "Meetings", permission: "read-write" },
        { name: "Emails", permission: "read-write" },
        { name: "quotations", permission: "read-write" },
        { name: "delivery-challans", permission: "read-write" },
        { name: "Forms", permission: "read-write" },
      ];

      // The code deliberately survives a join. It used to be rotated here
      // ("for security"), which made it single-use: the first person to join
      // invalidated the copy every other invitee had been given, so admins
      // had to fetch and re-share a new code for each teammate. The rest of
      // the product treats it as a standing code - User Management shows one
      // persistent code to copy, and its Reset button exists precisely
      // because rotating is meant to be a deliberate admin action ("This
      // will invalidate the current code"). Joins stay bounded by the seat
      // check above, not by the code being one-shot.
    } else if (req.body.orgName) {
      // User is creating a new organization
      const code = await generateUniqueCode();
      const org = new Organization({ 
        name: req.body.orgName, 
        code,
        ...(req.body.gstNumber && { gstNumber: req.body.gstNumber })
      });
      await org.save();
      organization = org._id;
      role = "admin";
      joinMethod = "create";
      permissions = [
        { name: "Companies", permission: "read-write" },
        { name: "Deals", permission: "read-write" },
        { name: "Contacts", permission: "read-write" },
        { name: "Invoices", permission: "read-write" },
        { name: "Tasks", permission: "read-write" },
        { name: "Vendors", permission: "read-write" },
        { name: "purchases", permission: "read-write" },
        { name: "purchase-orders", permission: "read-write" },
        { name: "Items", permission: "read-write" },
        { name: "Meetings", permission: "read-write" },
        { name: "Emails", permission: "read-write" },
        { name: "quotations", permission: "read-write" },
        { name: "delivery-challans", permission: "read-write" },
        { name: "Forms", permission: "read-write" },
      ];

      const branding = new Branding();
      branding.companyName = req.body.orgName;
      branding.colors = { primary: "#ffffff", secondary: "#000000" };
      branding.organization = organization;
      if (req.body.gstNumber) branding.gstin = req.body.gstNumber;
      await branding.save();

      const kanbanBoard = new KanbanBoard({
        statuses: ["Open", "Won", "Lost"], // Set default statuses explicitly
        organization: organization,
        // Don't set user field since this is organization-wide
      });
      await kanbanBoard.save();
      console.log(
        `KanbanBoard created for new organization: ${req.body.orgName}`,
      );

      // Referral intent — recorded HERE, at organization registration, the
      // business event that means "we know this organization was
      // referred." This is deliberately independent of whether the org
      // ever starts a trial or pays: Pending referrals exist so both sides
      // can already see the referral happened, and neither trial start nor
      // payment should gate that visibility. Never blocks signup on
      // failure. This only ever covers a code captured from a shared link
      // (via localStorage, see App.jsx) — a code typed in manually on the
      // checkout page is applied immediately there instead (see
      // subscriptionController.applyReferralCode), since registration has
      // already completed by the time that field is visible. See
      // backend/docs/REFERRAL_SYSTEM_DESIGN.md §3/§24 and PROJECT_STATE.md §11.
      if (req.body.referralCode) {
        try {
          const { recordReferralIntent } = require('../utils/referralUtils');
          const result = await recordReferralIntent(organization, req.body.referralCode);
          if (!result.created) {
            console.warn(`Referral code not recorded at registration: ${result.reason}`);
          }
        } catch (referralErr) {
          console.error("Failed to record referral intent at registration:", referralErr.message);
        }
      }

    } else {
      return res.status(400).json({
        message: "Provide company code or organization name",
        requiresSetup: true,
      });
    }

    // Check if profileEmail is already taken (for phone) or email
    if (provider === "phone" && email) {
      const emailTaken = await User.findOne({
        $or: [{ profileEmail: email }, { email }],
      });
      if (emailTaken) {
        return res
          .status(400)
          .json({ message: "This email is already registered" });
      }
    } else if (email) {
      const emailTaken = await User.findOne({
        email,
        auth0Id: { $ne: sub },
      });
      if (emailTaken) {
        return res
          .status(400)
          .json({ message: "This email is already registered" });
      }
    }

    // Create the user. User.name is required, so fall back to the email
    // local part when no provider or form name was supplied — "Unknown"
    // rendered as the signed-in user's display name in the nav.
    const userData = {
      name: name || (email ? email.split("@")[0] : "Unknown"),
      role,
      organization,
      permissions,
    };

    // Only set fields if they have values
    if (provider !== "phone" && sub) {
      userData.auth0Id = sub;
    }
    if (provider !== "phone" && email) {
      userData.email = email;
    }
    if (provider === "phone" && email) {
      userData.profileEmail = email;
    }
    if (provider === "phone" && phone) {
      userData.phone = phone;
    }
    console.log("USER DATA");
    console.log(userData);

    console.log("ORGANIZATION");
    console.log(organization);

    console.log("REQUEST BODY");
    console.log(req.body);

    user = new User(userData);

    await user.save();

    // Note: new organizations start empty — no sample/demo data is seeded.
    // (Previously auto-created a placeholder "HDFC Bank / Organization Pvt
    // Ltd / 1234567890" BankDetails record here, contradicting this very
    // comment — every org got an identical dummy account, which looked like
    // leaked cross-org data since the fields were indistinguishable.)

    // Notify the org's admins (email + in-app) that a new staff member has
    // joined — best-effort, never blocks registration itself.
    if (role !== "admin") {
      notifyAdminsOfNewStaff({ organization, staffUser: user }).catch((err) =>
        console.error("Failed to notify admins of new staff:", err.message)
      );
    }

    console.log(
      `User registered successfully - Method: ${joinMethod}, Email: ${email || phone
      }, Organization: ${organization}`,
    );

    const token =
      provider === "phone"
        ? jwt.sign(
          {
            sub: `phone|${phone}`,
            name,
            [`${namespace}email`]: email,
            [`${namespace}name`]: name,
          },
          process.env.JWT_SECRET,
          { expiresIn: "1h" },
        )
        : null;

    if (role === "admin") {
      const org = await Organization.findById(organization);
      res.json({ success: true, user, companyCode: org.code, token });
    } else {
      res.json({ success: true, user, token });
    }
  } catch (error) {
    console.error("Registration error:", error);
    // Both fields: clients read `message`, so returning only `error` meant a
    // real failure surfaced as a generic "Failed to complete setup" with the
    // cause visible nowhere but the server log.
    res.status(500).json({ error: error.message, message: error.message });
  }
};

// Password Reset - Forgot Password
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });

  try {
    const user = await User.findOne({ email });

    // Always return the same generic message to prevent email enumeration
    if (!user) {
      return res.json({ message: "If that email is in our system, we sent a reset link to it." });
    }

    // Auth0, Google, Facebook, and phone users have no local password —
    // they authenticate via their provider and cannot use this reset flow.
    if (!user.password) {
      return res.status(400).json({
        message: "This account uses social or phone sign-in. Please sign in via your original method.",
      });
    }

    // Generate a cryptographically random raw token (sent in the email link)
    // and store only its SHA-256 hash in the DB — raw token never touches the DB.
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    user.passwordResetToken = tokenHash;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${rawToken}`;

    if (process.env.NODE_ENV !== "production") {
      console.log("Reset link:", resetLink);
    }

    await sendGridMail({
      to: email,
      subject: "Reset your DataCircles password",
      html: renderEmail({
        greetingName: user.name || null,
        intro: 'We received a request to reset the password for your DataCircles account. Use the button below to choose a new one.',
        ctaLabel: 'Reset password',
        ctaUrl: resetLink,
        closingHtml: "<p style=\"margin:8px 0 0;font-size:14px;line-height:1.6;color:#333333;\">This link expires in 1 hour. If you didn't make this request, no action is needed and your password stays the same.</p>",
        preheader: 'Reset your DataCircles password.',
      }),
    });

    res.json({ message: "If that email is in our system, we sent a reset link to it." });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Password Reset - Reset Password
exports.resetPassword = async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ message: "Token and new password are required" });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters" });
  }

  try {
    // Hash the incoming raw token to match what's stored in the DB
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      passwordResetToken: tokenHash,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    user.password = await bcrypt.hash(password, 12);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.json({ message: "Password successfully reset. You can now sign in." });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Setup Workspace (Onboarding)
exports.setupWorkspace = async (req, res) => {
  try {
    const user = req.user;
    const {
      name,
      firstName,
      lastName,
      email,
      workspaceName,
      workspaceAddress,
      workspaceState,
      usage,
      mainGoal,
      source,
    } = req.body;

    // Update User Profile
    if (name) user.name = name;
    if (email) user.email = email;

    // Update Onboarding Intent (legacy/backward compatibility)
    user.onboardingIntent = {
      usage,
      mainGoal,
      source,
    };

    // Update Onboarding Progress
    user.onboarding.isCompleted = true;
    user.onboarding.currentStep = 3;

    // Update New User Data Structure
    user.userData.onboardingData = {
      personalInfo: {
        firstName: firstName || "",
        lastName: lastName || "",
      },
      workspaceInfo: {
        workspaceName: workspaceName || "",
        address: workspaceAddress || "",
        state: workspaceState || "",
        role: "admin", // Default role for workspace creator
      },
      preferences: {
        useCases: usage ? [usage] : [],
        priorities: mainGoal ? [mainGoal] : [],
        teamType: source ? [source] : [],
      },
    };

    // Update Organization
    const organization = await Organization.findById(user.organization);
    if (!organization) {
      return res.status(404).json({ message: "Organization not found" });
    }

    if (workspaceName) organization.name = workspaceName;
    if (workspaceAddress) organization.address = workspaceAddress;
    if (workspaceState) organization.state = workspaceState;

    // Handle Workspace Logo Upload
    if (req.file && req.fileLocation) {
      // Delete old logo if exists (optional logic, similar to profile picture)
      if (organization.logo && organization.logo.includes("cloudfront")) {
        const oldKey = organization.logo.split(".net/")[1];
        if (oldKey) {
          const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
          const { s3 } = require("../middlewares/uploadMiddlewareS3");
          try {
            await s3.send(
              new DeleteObjectCommand({
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: oldKey,
              }),
            );
          } catch (e) {
            console.error("Error deleting old logo", e);
          }
        }
      }
      organization.logo = req.fileLocation;
    }

    await user.save();
    await organization.save();

    res.json({
      success: true,
      message: "Workspace details updated successfully",
      user,
      organization,
    });
  } catch (error) {
    console.error("Setup workspace error:", error);
    res.status(500).json({ error: error.message });
  }
};


/**
 * Login for all user roles
 * POST /api/v1/auth/login
 */

exports.login = async (req, res, next) => {
  try {
    const { email, phone, password } = req.body;

    // 1. Construct search condition (Mongoose uses direct objects)
    const searchCondition = email ? { email } : { phone };

    // 2. Find user and populate organization if needed
    const user = await User.findOne(searchCondition).populate("organization");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: `Invalid ${email ? "email" : "phone number"} or password`,
      });
    }

    // 3. Verify Password 
    // Note: Ensure you add 'password' to your User schema. 
    // If using password_hash from Sequelize, rename field accordingly.
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // 4. Role-Based Logic (Adapted for your Mongoose schema)
    // Your schema uses "admin" or "staff". Drivers logic removed/updated:
    if (user.role === "staff" && user.onboarding?.isCompleted === false) {
      // Optional: Example of specific logic for your schema's state
      console.log("User has not finished onboarding");
    }

    // 5. Generate JWT
    // sub uses a "password|<userId>" format so authMiddleware/userSyncMiddleware
    // can recognize this as a local password-login token (mirrors the phone|
    // token convention) instead of falling through to Auth0 JWKS verification.
    const token = jwt.sign(
      {
        sub: `password|${user._id}`,
        user_id: user._id, // Mongoose uses _id
        role: user.role,
        organization: user.organization?._id,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // 6. Prepare Response
    // Convert to object and remove sensitive data
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: userResponse,
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Google Meet integration — one-time OAuth consent that connects a shared
// Google account for the organization. See services/googleMeetService.js
// for the full explanation of the shared-account model and why the refresh
// token lives server-side rather than per-user.
// ---------------------------------------------------------------------------
const {
  isGoogleConfigured,
  isGoogleConnectedByDefault,
  getAuthUrl,
  connectAccount,
} = require("../services/googleMeetService");
const GoogleIntegration = require("../models/GoogleIntegration");

// GET /api/auth/google/connect — called via fetch (so it can carry the
// Authorization header) from the settings UI. Returns an authUrl the
// frontend then navigates the browser to; it does NOT redirect itself,
// because a real browser navigation here would drop the auth header this
// route needs to identify which organization is connecting.
exports.googleConnect = async (req, res) => {
  try {
    if (!isGoogleConfigured()) {
      return res.status(400).json({
        error: "Google integration isn't configured on this server yet (missing GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI).",
      });
    }
    // Short-lived signed state carries the org/user identity through the
    // Google redirect round-trip, since the callback below has no
    // Authorization header to read them from otherwise.
    const state = jwt.sign(
      { organizationId: req.user.organization, userId: req.user._id || req.user.id },
      process.env.JWT_SECRET,
      { expiresIn: "10m" },
    );
    res.json({ authUrl: getAuthUrl(state) });
  } catch (error) {
    console.error("Error starting Google connect flow:", error);
    res.status(500).json({ error: "Failed to start Google connect flow" });
  }
};

// GET /api/auth/google/callback — Google lands the browser here after
// consent. No requireAuth: this is a plain top-level navigation from
// Google's servers, not an authenticated API call from our own frontend.
exports.googleCallback = async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  try {
    const { code, state, error: googleError } = req.query;
    if (googleError) {
      return res.redirect(`${frontendUrl}/settings?googleMeet=denied`);
    }
    if (!code || !state) {
      return res.redirect(`${frontendUrl}/settings?googleMeet=error`);
    }

    const { organizationId, userId } = jwt.verify(state, process.env.JWT_SECRET);
    const { email } = await connectAccount({ code, organizationId, userId });

    res.redirect(`${frontendUrl}/settings?googleMeet=connected&email=${encodeURIComponent(email)}`);
  } catch (error) {
    console.error("Error completing Google connect flow:", error.message);
    res.redirect(`${frontendUrl}/settings?googleMeet=error`);
  }
};

// GET /api/auth/google/status — lets the settings UI show whether a Google
// account is already connected for this organization, and which one.
exports.googleStatus = async (req, res) => {
  try {
    // A static GOOGLE_OAUTH_REFRESH_TOKEN in .env makes every meeting use
    // that account immediately — no per-org DB record, no consent click.
    if (isGoogleConnectedByDefault()) {
      return res.json({ configured: true, connected: true, connectedEmail: null, staticDefault: true });
    }

    const integration = await GoogleIntegration.findOne({ organization: req.user.organization });
    res.json({
      configured: isGoogleConfigured(),
      connected: !!integration,
      connectedEmail: integration?.connectedEmail || null,
      staticDefault: false,
    });
  } catch (error) {
    console.error("Error fetching Google integration status:", error);
    res.status(500).json({ error: "Failed to fetch Google integration status" });
  }
};

// DELETE /api/auth/google/disconnect — removes this organization's stored
// refresh token so Generate Link stops using this Google account. Only
// applies to the per-org consent flow; when a static GOOGLE_OAUTH_REFRESH_TOKEN
// is set there's no per-org record to remove, so this is a no-op in that mode.
exports.googleDisconnect = async (req, res) => {
  try {
    if (isGoogleConnectedByDefault()) {
      return res.status(400).json({
        error: "This Google account is configured server-wide and can't be disconnected here.",
      });
    }
    await GoogleIntegration.deleteOne({ organization: req.user.organization });
    res.json({ success: true });
  } catch (error) {
    console.error("Error disconnecting Google integration:", error);
    res.status(500).json({ error: "Failed to disconnect Google account" });
  }
};

// GET /api/auth/intercom-jwt — Intercom Messenger JWT security. Signed
// server-side with INTERCOM_SECRET_KEY (the Messenger API Secret from
// Intercom Settings > Messenger > Security) so a client can never forge a
// token to impersonate another user in chat. Short-lived (1h) since the
// frontend re-fetches it on every boot.
exports.getIntercomJwt = async (req, res) => {
  try {
    const secretKey = process.env.INTERCOM_SECRET_KEY;
    if (!secretKey) {
      return res.status(503).json({ error: "Intercom is not configured" });
    }
    const identity = req.superAdmin || req.user;
    const token = jwt.sign(
      {
        user_id: identity._id.toString(),
        email: identity.email,
      },
      secretKey,
      { expiresIn: "1h" },
    );
    res.status(200).json({ token });
  } catch (error) {
    console.error("Error generating Intercom JWT:", error);
    res.status(500).json({ error: "Failed to generate Intercom JWT" });
  }
};
