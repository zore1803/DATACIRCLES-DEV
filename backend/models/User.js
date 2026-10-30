// models/User.js
const mongoose = require("mongoose");

const permissionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    permission: {
      type: String,
      enum: ["readonly", "read-write", "own-only"],
      required: true,
    },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    // One person can belong to several organizations. Each membership is its own User
    // record (role, permissions and every org-scoped reference stay per organization), and
    // the records of one person share `personId`. So auth0Id / email / profileEmail repeat
    // across a person's records and are unique per ORGANIZATION instead (see the indexes
    // at the bottom of this file).
    auth0Id: {
      type: String,
      // Remove default: null to prevent explicit nulls
    },
    name: String,
    email: {
      type: String,
      // Remove default: null to prevent explicit nulls
    },
    password: {
      type: String,
      // Secret: never returned by a query, populate(), lean() or toJSON() unless the
      // caller opts in with `.select("+password")` (only login / forgot-password /
      // unlink-Google do). Without this every `populate("user")` that forgot a field
      // list shipped the hash to the browser.
      select: false,
      // Phone-authenticated users never get an auth0Id (authController.js
      // deliberately keeps the temp-phone sub out of it, looking them up by
      // `phone` instead) — without this, every phone signup/join failed
      // "password is required" since it has neither a password nor auth0Id.
      required: function () {
        return !this.auth0Id && !this.phone;
    }
    },
    profileEmail: {
      type: String,
      // Remove default: null to prevent explicit nulls
    },
    // Links the records (organization memberships) that belong to the same person. Set when a
    // second organization is added from an authenticated session or an authenticated signup,
    // never inferred from email or phone: switching between organizations is only allowed
    // between records that share this id. Absent on a single-organization account.
    personId: { type: mongoose.Schema.Types.ObjectId, index: true },
    // Not unique — multiple accounts (e.g. a shared family/office number, or
    // one person's separate personal and staff accounts) can register the
    // same phone number. Login-by-phone (verifyOtp/userSync) resolves ties
    // by taking the first match, same as before this was ever unique.
    phone: {
      type: String,
      sparse: true,
      // Remove default: null to prevent explicit nulls
    },
    role: { type: String, enum: ["admin", "staff"], default: "staff" },
    profileUrl: String,
    // Default true so existing accounts (verified implicitly by their
    // original signup flow: Auth0 email or phone-OTP) aren't suddenly
    // prompted to reverify. Only flipped to false when updateProfile sets a
    // new/changed email or phone from the Profile settings page.
    isEmailVerified: { type: Boolean, default: true },
    isPhoneVerified: { type: Boolean, default: true },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    onboardingIntent: {
      usage: String,
      mainGoal: String,
      source: String,
    },
    // Onboarding Progress Tracker
    onboarding: {
      isCompleted: {
        type: Boolean,
        default: false,
      },
      currentStep: {
        type: Number,
        default: 1,
      },
    },
    // User Data Container (Future-Proof)
    userData: {
      onboardingData: {
        personalInfo: {
          firstName: { type: String },
          lastName: { type: String },
        },
        workspaceInfo: {
          workspaceName: { type: String },
          address: { type: String },
          state: { type: String },
          role: { type: String },
        },
        preferences: {
          useCases: [{ type: String }],
          priorities: [{ type: String }],
          teamType: [{ type: String }],
        },
      },
      mainData: {
        bio: { type: String },
        profilePic: { type: String },
      },
      futureData: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
    },
    permissions: [permissionSchema],
    // Secrets, same rule as `password`: hidden unless explicitly selected. Queries can
    // still FILTER on them (resetPassword looks the user up by token).
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
  },
  { timestamps: true },
);

// One record per (identity, organization). Partial indexes (only when the field is a string)
// keep the old "sparse" behaviour: records without the field never collide.
// The previous global unique indexes (email_1, auth0Id_1, profileEmail_1) must be dropped from
// the database for these to take effect: run scripts/migrateUserIdentityIndexes.js.
userSchema.index(
  { auth0Id: 1, organization: 1 },
  { unique: true, partialFilterExpression: { auth0Id: { $type: "string" } } },
);
userSchema.index(
  { email: 1, organization: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } } },
);
userSchema.index(
  { profileEmail: 1, organization: 1 },
  { unique: true, partialFilterExpression: { profileEmail: { $type: "string" } } },
);

module.exports = mongoose.model("User", userSchema);
