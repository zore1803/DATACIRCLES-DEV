import DeleteIcon from "../components/common/DeleteIcon";
import CellphoneIcon from "../components/common/CellphoneIcon";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import API, { configureAxios } from "../services/api";
import { useAuth0 } from "@auth0/auth0-react";
import { User, Mail, Camera, LogOut, X, Monitor, ShieldCheck } from "lucide-react";
import logo from "/DataCircles.png";
import toast from "react-hot-toast";
import AppToaster from "../components/AppToaster";
import PhoneNumberInput, { splitPhone, joinPhone } from "../components/common/PhoneNumberInput";
import { DEFAULT_DIAL_CODE } from "../utils/countryDialCodes";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import { createAuth0Client } from "@auth0/auth0-spa-js";
import { GoogleGIcon } from "../components/settings/GoogleIntegration";

const Profile = () => {
  const { user: auth0User, getAccessTokenSilently, logout } = useAuth0();
  const [user, setUser] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState(DEFAULT_DIAL_CODE);
  // Which credential this session actually logged in with (from GET
  // /auth/me's loginMethod) — that one is locked as read-only below, since
  // changing it could break the account's own sign-in; the OTHER field is
  // freely editable inline, verified via OTP same as before.
  const [loginMethod, setLoginMethod] = useState("email");
  const phoneIsLoginCredential = loginMethod === "phone";
  // Whether the "Want to change your email/mobile number?" link (below Save
  // and Update — only ever shown for the LOCKED credential field, kept
  // separate from the other field's always-editable input) has been
  // clicked — reveals that credential field's own OTP change flow.
  const [showPhoneChangeFlow, setShowPhoneChangeFlow] = useState(false);
  const [showEmailChangeFlow, setShowEmailChangeFlow] = useState(false);
  // "Confirm Action" modal for changing the credential field — verified via
  // the OTHER, already-linked contact method rather than an OTP to the new
  // value (see send/confirmCredentialChangeVerification). On success it
  // unlocks the field above (showEmailChangeFlow/showPhoneChangeFlow) and
  // hands back a short-lived changeToken that authorizes the actual write.
  const [credentialModalOpen, setCredentialModalOpen] = useState(false);
  const [credentialModalField, setCredentialModalField] = useState(null); // 'email' | 'phone'
  const [credentialModalStep, setCredentialModalStep] = useState("confirm"); // 'confirm' | 'otp'
  const [credentialModalOtpValue, setCredentialModalOtpValue] = useState("");
  const [credentialModalSending, setCredentialModalSending] = useState(false);
  const [credentialModalVerifying, setCredentialModalVerifying] = useState(false);
  const [credentialModalMasked, setCredentialModalMasked] = useState("");
  // Set when there's truly nothing to verify through (no linked field AND
  // no current value for the credential itself) — shown inline instead of
  // just a toast, with the Cancel button relabeled "Back to Profile" since
  // there's nothing further to do in this modal.
  const [credentialModalError, setCredentialModalError] = useState("");
  const [credentialChangeToken, setCredentialChangeToken] = useState(null);
  const [credentialChangeTokenField, setCredentialChangeTokenField] = useState(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [pendingEmail, setPendingEmail] = useState(null);
  const [emailChangeOtpValue, setEmailChangeOtpValue] = useState("");
  const [emailChangeSending, setEmailChangeSending] = useState(false);
  const [emailChangeChecking, setEmailChangeChecking] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  // Inline OTP verify widgets for the email/phone fields below — "target"
  // holds which one ("email" | "phone" | null) currently has its OTP input
  // open, since only one can be verified at a time.
  const [verifyTarget, setVerifyTarget] = useState(null);
  const [verifyOtpValue, setVerifyOtpValue] = useState("");
  const [verifySending, setVerifySending] = useState(false);
  const [verifyChecking, setVerifyChecking] = useState(false);
  // A phone number the user has typed but not yet saved — it only reaches
  // the database once the OTP sent to it is confirmed, so it never
  // overwrites the verified number just because "Save and Update" was
  // clicked. Non-null while that confirmation is pending.
  const [pendingPhone, setPendingPhone] = useState(null);
  const [phoneChangeOtpValue, setPhoneChangeOtpValue] = useState("");
  const [phoneChangeSending, setPhoneChangeSending] = useState(false);
  const [phoneChangeChecking, setPhoneChangeChecking] = useState(false);
  // True once the OTP for pendingPhone has been confirmed — the number is
  // still not saved at that point, only shown as verified inline; it's
  // written to the database only when "Save and Update" is clicked next.
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [profileImage, setProfileImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [profileBase64, setProfileBase64] = useState(null);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isRemovePhotoModalOpen, setIsRemovePhotoModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sessions, setSessions] = useState(null);
  const [sessionsError, setSessionsError] = useState("");
  const [revokingId, setRevokingId] = useState(null);
  const [sessionsModalOpen, setSessionsModalOpen] = useState(false);
  // Danger Zone — "reset-data" | "delete-account" | null. Both just file a
  // request for the org's admins to act on (see submitAccountRequest);
  // neither is performed automatically from this modal.
  const [accountRequestType, setAccountRequestType] = useState(null);
  const [accountRequestSubmitting, setAccountRequestSubmitting] = useState(false);
  // Required before "Submit Request" is enabled on the reset-data disclosure —
  // resets are irreversible, so this can't be a one-click confirm.
  const [accountRequestAcknowledged, setAccountRequestAcknowledged] = useState(false);
  // Once acknowledged, typing the org's exact name is a second, harder-to-
  // fat-finger confirmation before the button unlocks.
  const [accountRequestOrgInput, setAccountRequestOrgInput] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false);

  // Locks the page behind whichever modal/panel is open so only that
  // card scrolls, not the page underneath it (see useBodyScrollLock).
  useBodyScrollLock(
    isLogoutModalOpen ||
      isRemovePhotoModalOpen ||
      sessionsModalOpen ||
      !!accountRequestType ||
      credentialModalOpen
  );

  // null during this component's very first render (before anything is
  // committed to the real DOM), then re-checked once after mount — a direct
  // load of /settings/profile mounts the Settings header strip and this
  // component in the same commit, so checking document.getElementById
  // synchronously during render can miss a target that exists a moment
  // later.
  const [headerTarget, setHeaderTarget] = useState(null);
  useEffect(() => {
    setHeaderTarget(document.getElementById('settings-header-actions'));
  }, []);
  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://localhost:5001";

  useEffect(() => {
    configureAxios(getAccessTokenSilently);
    const fetchUser = async () => {
      try {
        const res = await API.get("/auth/me");
        setUser(res.data?.user);
        setNameDraft(res.data?.user?.name || "");
        setPhoneDraft(res.data?.user?.phone || "");
        setEmailDraft(res.data?.user?.email || res.data?.user?.profileEmail || "");
        setLoginMethod(res.data?.loginMethod || "email");
        setOrganizationName(res.data?.organizationName || "");
      } catch (err) {
        console.error("Failed to fetch user", err);
      }
    };
    fetchUser();
    fetchSessions();
  }, [getAccessTokenSilently]);

  const fetchSessions = async () => {
    try {
      const res = await API.get("/session");
      setSessions(res.data.sessions);
      setSessionsError("");
    } catch {
      // Non-fatal — no application route enforces sessionAuth yet, so a
      // user who hasn't gone through /session/establish simply has no
      // dc_session cookie and this 401s. Show a quiet, non-alarming state.
      setSessions([]);
      setSessionsError("");
    }
  };

  const handleRevokeSession = async (id) => {
    setRevokingId(id);
    try {
      await API.delete(`/session/${id}`);
      await fetchSessions();
    } catch {
      setSessionsError("Failed to sign out that session. Please try again.");
    } finally {
      setRevokingId(null);
    }
  };

  const handleSubmitAccountRequest = async () => {
    setAccountRequestSubmitting(true);
    try {
      const res = await API.post("/auth/account-request", { type: accountRequestType });
      toast.success(res.data.message || "Request submitted.");
      setAccountRequestType(null);
      setAccountRequestAcknowledged(false);
      setAccountRequestOrgInput("");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Failed to submit request. Please try again.");
    } finally {
      setAccountRequestSubmitting(false);
    }
  };

  // Uses an isolated auth0-spa-js client — deliberately NOT the app's own
  // useAuth0 hook/Auth0Provider — so authenticating against Google here
  // never replaces or disturbs the session already signed into this page.
  // We only ever read the popup client's resulting access token and hand it
  // to the backend; nothing from it touches app-wide auth state.
  const handleConnectGoogle = async () => {
    setConnectingGoogle(true);
    try {
      const linkClient = await createAuth0Client({
        domain: import.meta.env.VITE_APP_AUTH0_DOMAIN,
        clientId: import.meta.env.VITE_APP_AUTH0_CLIENT_ID,
        authorizationParams: {
          audience: import.meta.env.VITE_APP_AUTH0_AUDIENCE,
          scope: "openid profile email",
        },
        cacheLocation: "memory",
      });
      await linkClient.loginWithPopup({
        authorizationParams: {
          connection: "google-oauth2",
          // Steers Google's account picker toward the account this is
          // connecting to — the backend still requires an exact match
          // (linkGoogleAccount), this just saves picking the wrong one.
          ...(user.email ? { login_hint: user.email } : {}),
        },
      });
      const accessToken = await linkClient.getTokenSilently();
      const res = await API.post("/auth/link-google", { accessToken });
      setUser(res.data.user);
      toast.success(res.data.message || "Google account connected!");
    } catch (err) {
      console.error(err);
      if (err?.error === "popup_closed") {
        // User just closed the Google popup — not a real failure, no toast.
        return;
      }
      toast.error(err.response?.data?.error || "Failed to connect Google account. Please try again.");
    } finally {
      setConnectingGoogle(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    setDisconnectingGoogle(true);
    try {
      const res = await API.delete("/auth/link-google");
      setUser(res.data.user);
      toast.success(res.data.message || "Google account disconnected.");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Failed to disconnect Google account. Please try again.");
    } finally {
      setDisconnectingGoogle(false);
    }
  };

  const handleLogout = async () => {
    // Revoke the DataCircles application session server-side before
    // clearing any client-side state — see backend/controllers/
    // sessionController.js logout.
    try {
      await API.post("/session/logout");
    } catch (err) {
      console.error("Failed to revoke DataCircles session:", err);
    }
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    // Clear browser history to prevent back button access
    window.history.replaceState(null, "", window.location.href);
    logout({ logoutParams: { returnTo: window.location.origin } });
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProfileImage(file);
      // Create preview URL
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
        setProfileBase64(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageUpload = async () => {
    if (!profileImage) return;
    setUploading(true);
    const formData = new FormData();
    // Only the raw file — updateProfile (backend/controllers/authController.js)
    // reads req.file/req.fileLocation from multer-s3 and never looks at a
    // base64 field, so sending one here was dead weight that actively broke
    // uploads: multer defaults to a 1MB limit on non-file field values, and
    // a base64-encoded image easily exceeds that as plain text, rejecting
    // the whole request with "Field value too long" before it ever reached
    // the controller.
    formData.append("profile", profileImage);
    try {
      // No explicit Content-Type here — axios/the browser must set it
      // themselves for a FormData body, since only they know the multipart
      // boundary string. Hardcoding "multipart/form-data" (no boundary)
      // used to strip that boundary, so multer could never parse the body
      // and every upload failed regardless of the file or S3 config.
      const res = await API.post("/auth/profile", formData);
      // Update local state from the response instead of reloading the whole
      // app — a full window.location.reload() re-fetched every page's data
      // from scratch just to show a new avatar, which felt like the entire
      // site had crashed/reset rather than one photo changing.
      setUser(res.data.user);
      clearImageSelection();
      toast.success("Profile image updated successfully!");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Failed to upload image. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const hasNameChange = user && nameDraft.trim() !== (user.name || "");
  const hasPhoneChange = user && phoneDraft.trim() !== (user.phone || "");
  const hasEmailChange =
    user && emailDraft.trim().toLowerCase() !== (user.email || user.profileEmail || "").toLowerCase();
  const hasProfileChanges = hasNameChange || hasPhoneChange || hasEmailChange;

  // A changed phone/email is only ever saveable once verified — for the
  // non-credential field, once its OTP-to-new-value is confirmed
  // (phoneVerified/emailVerified); for the credential field, once step-up
  // verification via the linked field produced a changeToken. Shared
  // between the Save button's disabled state and handleSaveProfile itself.
  const canSavePhone = pendingPhone && phoneVerified;
  const canSaveEmail = pendingEmail && emailVerified;
  const canSavePhoneViaToken =
    phoneIsLoginCredential &&
    showPhoneChangeFlow &&
    hasPhoneChange &&
    credentialChangeTokenField === "phone" &&
    !!credentialChangeToken;
  const canSaveEmailViaToken =
    !phoneIsLoginCredential &&
    showEmailChangeFlow &&
    hasEmailChange &&
    credentialChangeTokenField === "email" &&
    !!credentialChangeToken;
  const canSaveAnything =
    hasNameChange || canSavePhone || canSaveEmail || canSavePhoneViaToken || canSaveEmailViaToken;

  const handleSaveProfile = async () => {
    const trimmedName = nameDraft.trim();
    const trimmedPhone = phoneDraft.trim();
    const trimmedEmailForSave = emailDraft.trim();

    if (!trimmedName) {
      toast.error("Full name cannot be empty");
      return;
    }
    if (trimmedPhone && !/^\d{10}$/.test(trimmedPhone)) {
      toast.error("Please enter a valid 10-digit phone number");
      return;
    }
    if (!canSaveAnything) return;

    setSavingName(true);
    try {
      const payload = {};
      if (hasNameChange) payload.name = trimmedName;
      if (canSaveEmail) payload.email = pendingEmail;
      else if (canSaveEmailViaToken) {
        payload.email = trimmedEmailForSave;
        payload.changeToken = credentialChangeToken;
      }
      if (canSavePhone) payload.phone = pendingPhone;
      else if (canSavePhoneViaToken) {
        payload.phone = trimmedPhone;
        payload.changeToken = credentialChangeToken;
      }
      const res = await API.post("/auth/profile", payload);
      setUser(res.data.user);
      setNameDraft(res.data.user.name || "");
      setPhoneDraft(res.data.user.phone || "");
      setEmailDraft(res.data.user.email || res.data.user.profileEmail || "");
      setPendingPhone(null);
      setPhoneVerified(false);
      setPendingEmail(null);
      setEmailVerified(false);
      setShowPhoneChangeFlow(false);
      setShowEmailChangeFlow(false);
      setCredentialChangeToken(null);
      setCredentialChangeTokenField(null);
      toast.success("Profile updated successfully!");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Failed to update profile. Please try again.");
    } finally {
      setSavingName(false);
    }
  };

  const handleSendPhoneChangeOtp = async (phone) => {
    setPhoneChangeSending(true);
    try {
      await API.post("/auth/send-phone-change-otp", { phone });
      setPendingPhone(phone);
      setPhoneVerified(false);
      setPhoneChangeOtpValue("");
      toast.success("OTP sent to your new phone number");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Failed to send OTP. Please try again.");
    } finally {
      setPhoneChangeSending(false);
    }
  };

  const handleConfirmPhoneChangeOtp = async () => {
    if (!phoneChangeOtpValue.trim()) {
      toast.error("Please enter the OTP");
      return;
    }
    setPhoneChangeChecking(true);
    try {
      await API.post("/auth/verify-phone-change-otp", {
        phone: pendingPhone,
        otp: phoneChangeOtpValue.trim(),
      });
      setPhoneVerified(true);
      setPhoneChangeOtpValue("");
      toast.success("Phone number verified! Click Save and Update to confirm.");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Invalid or expired OTP. Please try again.");
    } finally {
      setPhoneChangeChecking(false);
    }
  };

  const handleCancelPhoneChange = () => {
    setPendingPhone(null);
    setPhoneVerified(false);
    setPhoneChangeOtpValue("");
    setPhoneDraft(user?.phone || "");
    setShowPhoneChangeFlow(false);
    if (credentialChangeTokenField === "phone") {
      setCredentialChangeToken(null);
      setCredentialChangeTokenField(null);
    }
  };

  const handleSendEmailChangeOtp = async (email) => {
    setEmailChangeSending(true);
    try {
      await API.post("/auth/send-email-change-otp", { email });
      setPendingEmail(email);
      setEmailVerified(false);
      setEmailChangeOtpValue("");
      toast.success("OTP sent to your new email");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Failed to send OTP. Please try again.");
    } finally {
      setEmailChangeSending(false);
    }
  };

  const handleConfirmEmailChangeOtp = async () => {
    if (!emailChangeOtpValue.trim()) {
      toast.error("Please enter the OTP");
      return;
    }
    setEmailChangeChecking(true);
    try {
      await API.post("/auth/verify-email-change-otp", {
        email: pendingEmail,
        otp: emailChangeOtpValue.trim(),
      });
      setEmailVerified(true);
      setEmailChangeOtpValue("");
      toast.success("Email verified! Click Save and Update to confirm.");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Invalid or expired OTP. Please try again.");
    } finally {
      setEmailChangeChecking(false);
    }
  };

  const handleCancelEmailChange = () => {
    setPendingEmail(null);
    setEmailVerified(false);
    setEmailChangeOtpValue("");
    setEmailDraft(user?.email || user?.profileEmail || "");
    setShowEmailChangeFlow(false);
    if (credentialChangeTokenField === "email") {
      setCredentialChangeToken(null);
      setCredentialChangeTokenField(null);
    }
  };

  const openCredentialModal = (field) => {
    setCredentialModalField(field);
    setCredentialModalStep("confirm");
    setCredentialModalOtpValue("");
    setCredentialModalMasked("");
    setCredentialModalError("");
    setCredentialModalOpen(true);
  };

  const closeCredentialModal = () => {
    setCredentialModalOpen(false);
    setCredentialModalField(null);
    setCredentialModalStep("confirm");
    setCredentialModalOtpValue("");
    setCredentialModalMasked("");
    setCredentialModalError("");
  };

  const handleSendCredentialVerification = async () => {
    setCredentialModalSending(true);
    setCredentialModalError("");
    try {
      const res = await API.post("/auth/send-credential-change-verification", {
        field: credentialModalField,
      });
      setCredentialModalMasked(res.data.maskedDestination || "");
      setCredentialModalStep("otp");
      toast.success(res.data.message || "OTP sent");
    } catch (err) {
      console.error(err);
      const message = err.response?.data?.error || "Failed to send OTP. Please try again.";
      toast.error(message);
      // "No email/phone on file..." is a dead end, not something retrying
      // fixes — surface it inline with a way back instead of leaving the
      // person stuck on a modal whose only action (Request OTP) will just
      // fail again.
      if (message.toLowerCase().includes("no ") && message.toLowerCase().includes("on file")) {
        setCredentialModalError(message);
      }
    } finally {
      setCredentialModalSending(false);
    }
  };

  const handleConfirmCredentialVerification = async () => {
    if (!credentialModalOtpValue.trim()) {
      toast.error("Please enter the OTP");
      return;
    }
    setCredentialModalVerifying(true);
    try {
      const res = await API.post("/auth/confirm-credential-change-verification", {
        field: credentialModalField,
        otp: credentialModalOtpValue.trim(),
      });
      setCredentialChangeToken(res.data.changeToken);
      setCredentialChangeTokenField(credentialModalField);
      if (credentialModalField === "email") setShowEmailChangeFlow(true);
      else setShowPhoneChangeFlow(true);
      toast.success("Verified! You can now enter the new value and click Save and Update.");
      closeCredentialModal();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Invalid or expired OTP. Please try again.");
    } finally {
      setCredentialModalVerifying(false);
    }
  };

  const openVerify = (target) => {
    setVerifyTarget(target);
    setVerifyOtpValue("");
  };

  const handleSendVerifyOtp = async (target) => {
    setVerifySending(true);
    try {
      await API.post(target === "email" ? "/auth/send-profile-email-otp" : "/auth/send-profile-phone-otp");
      toast.success(`OTP sent to your ${target === "email" ? "email" : "phone"}`);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Failed to send OTP. Please try again.");
    } finally {
      setVerifySending(false);
    }
  };

  const handleConfirmVerifyOtp = async (target) => {
    if (!verifyOtpValue.trim()) {
      toast.error("Please enter the OTP");
      return;
    }
    setVerifyChecking(true);
    try {
      const res = await API.post(
        target === "email" ? "/auth/verify-profile-email-otp" : "/auth/verify-profile-phone-otp",
        { otp: verifyOtpValue.trim() }
      );
      setUser(res.data.user);
      setVerifyTarget(null);
      setVerifyOtpValue("");
      toast.success(`${target === "email" ? "Email" : "Phone number"} verified successfully!`);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Invalid or expired OTP. Please try again.");
    } finally {
      setVerifyChecking(false);
    }
  };

  const clearImageSelection = () => {
    setProfileImage(null);
    setImagePreview(null);
    setProfileBase64(null);
  };

  const handleRemovePhoto = async () => {
    setIsRemovePhotoModalOpen(false);
    try {
      setUploading(true);
      const res = await API.delete("/auth/profile");
      setUser(res.data.user);
      toast.success("Profile photo removed successfully!");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Failed to remove photo. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  if (!user) {
    return (
      <PageSkeleton variant="generic" />
    );
  }

  return (
    <div>
      <AppToaster />

      {/* Lives in the shared Settings header strip (see Settings.jsx's
          #settings-header-actions target) when embedded there — the strip
          already shows "Profile" as the title. Falls back to an inline row
          when rendered standalone (e.g. the bare /profile route), where that
          target doesn't exist, so Logout is never stranded with no way to
          reach it. headerTarget is re-checked after mount (settingsHeaderTick)
          since the target may not exist yet during this component's very
          first render (e.g. a hard refresh straight into /settings/profile,
          where the strip and this component mount in the same commit). */}
      {headerTarget &&
        createPortal(
          <button
            onClick={() => setIsLogoutModalOpen(true)}
            className="flex items-center gap-2 px-4 h-[38px] text-sm font-medium text-red-600 hover:bg-red-50 rounded-full transition-colors whitespace-nowrap"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>,
          headerTarget
        )}

      {/* Profile fields — sit directly on the page, no card wrapper */}
      <div>
        {/* Profile Header with Avatar */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 h-32 relative rounded-t-2xl">
          {/* Fallback Logout — only when there's no shared Settings header
              strip to portal into (e.g. the bare /profile route). Sits
              inside the gradient banner itself instead of floating in its
              own row above it. */}
          {!headerTarget && (
            <button
              onClick={() => setIsLogoutModalOpen(true)}
              className="absolute top-4 right-4 flex items-center gap-2 px-4 h-[38px] text-sm font-medium text-white bg-white/15 hover:bg-white/25 rounded-full transition-colors whitespace-nowrap backdrop-blur-sm"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          )}
          <div className="absolute -bottom-16 left-8">
            <div className="relative group">
              <div className="w-32 h-32 rounded-full border-4 border-white bg-white shadow-lg overflow-hidden relative">
                {user.profileUrl || imagePreview ? (
                  <img
                    src={imagePreview || user.profileUrl}
                    alt="Profile"
                    className="w-full h-full object-cover transition-all duration-200 group-hover:blur-sm group-hover:brightness-75"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                    <User className="w-16 h-16 text-gray-400" />
                  </div>
                )}
                <label
                  htmlFor="profile-upload"
                  className="absolute inset-0 flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Change Photo"
                >
                  <Camera className="w-6 h-6 text-white drop-shadow" />
                  <input
                    id="profile-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
              </div>
              {user.profileUrl && !imagePreview && (
                <button
                  onClick={() => setIsRemovePhotoModalOpen(true)}
                  disabled={uploading}
                  className="absolute bottom-2 right-2 bg-white rounded-full p-2 shadow-lg cursor-pointer hover:bg-red-50 transition-colors"
                  title="Remove Photo"
                >
                  <DeleteIcon className="w-4 h-4 text-red-600" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Profile Content */}
        <div className="pt-20 px-8 pb-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              {user.name}
            </h2>
            <p className="text-gray-500 text-sm">
              {user.email || user.profileEmail}
            </p>
          </div>

          {/* Profile Information Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <User className="w-4 h-4 text-gray-500" />
                Full Name
                <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                disabled={savingName}
                required
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-full text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <Mail className="w-4 h-4 text-gray-500" />
                Email Address
              </label>
              {!phoneIsLoginCredential && !showEmailChangeFlow ? (
                <input
                  type="email"
                  value={user.email || user.profileEmail || ""}
                  readOnly
                  placeholder="Not set"
                  className="w-full px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-full text-sm text-gray-500 cursor-not-allowed focus:outline-none"
                />
              ) : !phoneIsLoginCredential && showEmailChangeFlow ? (
                // Email IS the login credential here, and step-up
                // verification via the linked phone already passed (the
                // "Confirm Action" modal) — just a plain input now, saved
                // with the changeToken instead of another OTP round.
                <div className="relative">
                  <input
                    type="email"
                    value={emailDraft}
                    onChange={(e) => setEmailDraft(e.target.value)}
                    placeholder="Enter your new email"
                    className="w-full pl-4 pr-20 py-2.5 bg-white border border-gray-200 rounded-full text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleCancelEmailChange}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-red-600 hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="email"
                    value={emailDraft}
                    onChange={(e) => setEmailDraft(e.target.value)}
                    disabled={!!pendingEmail}
                    placeholder="Add an email address"
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-full text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />

                  {/* A new, not-yet-saved email is only written to the
                      database once its OTP is confirmed — same pattern as
                      the phone-change flow below. */}
                  {hasEmailChange && !pendingEmail && (
                    <button
                      onClick={() => {
                        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                        if (!emailRegex.test(emailDraft.trim())) {
                          toast.error("Please enter a valid email address");
                          return;
                        }
                        handleSendEmailChangeOtp(emailDraft.trim());
                      }}
                      disabled={emailChangeSending}
                      className="mt-2 text-xs text-[#0085FF] hover:underline disabled:opacity-40"
                    >
                      {emailChangeSending ? "Sending OTP..." : "Click here to verify your new email"}
                    </button>
                  )}

                  {pendingEmail && !emailVerified && (
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                      <p className="text-xs text-gray-700 mb-2">
                        Enter the OTP sent to <span className="font-semibold">{pendingEmail}</span> to confirm this address. It won't be saved until verified.
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={emailChangeOtpValue}
                          onChange={(e) => setEmailChangeOtpValue(e.target.value)}
                          placeholder="Enter OTP"
                          className="w-32 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={handleConfirmEmailChangeOtp}
                          disabled={emailChangeChecking}
                          className="text-xs font-semibold text-[#0085FF] hover:underline disabled:opacity-40"
                        >
                          {emailChangeChecking ? "Verifying..." : "Verify"}
                        </button>
                        <button
                          onClick={() => handleSendEmailChangeOtp(pendingEmail)}
                          disabled={emailChangeSending}
                          className="text-xs text-gray-500 hover:underline disabled:opacity-40"
                        >
                          Resend
                        </button>
                        <button
                          onClick={handleCancelEmailChange}
                          className="text-xs text-gray-500 hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {pendingEmail && emailVerified && (
                    <div className="mt-2 flex items-center gap-2">
                      <p className="text-xs font-semibold text-green-600">
                        ✓ {pendingEmail} verified — click Save and Update to confirm.
                      </p>
                      <button
                        onClick={handleCancelEmailChange}
                        className="text-xs text-gray-500 hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <CellphoneIcon className="w-4 h-4 text-gray-500" />
                Phone Number
              </label>
              {phoneIsLoginCredential && !showPhoneChangeFlow ? (
                <input
                  type="tel"
                  value={user.phone || ""}
                  readOnly
                  placeholder="Not set"
                  className="w-full px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-full text-sm text-gray-500 cursor-not-allowed focus:outline-none"
                />
              ) : phoneIsLoginCredential && showPhoneChangeFlow ? (
                // Phone IS the login credential here, and step-up
                // verification via the linked email already passed — just a
                // plain input now, saved with the changeToken instead of
                // another OTP round.
                <div className="relative">
                  <PhoneNumberInput
                    value={joinPhone(phoneCountryCode, phoneDraft)}
                    onChange={(val) => {
                      const { code, number } = splitPhone(val);
                      setPhoneCountryCode(code || DEFAULT_DIAL_CODE);
                      setPhoneDraft(number);
                    }}
                    placeholder="Enter your new phone number"
                    selectClassName="border border-gray-200 rounded-full px-2 h-[42px] text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all flex-shrink-0"
                    inputClassName="flex-1 min-w-0 pl-4 pr-20 h-[42px] bg-white border border-gray-200 rounded-full text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleCancelPhoneChange}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-red-600 hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <PhoneNumberInput
                    value={joinPhone(phoneCountryCode, phoneDraft)}
                    onChange={(val) => {
                      const { code, number } = splitPhone(val);
                      setPhoneCountryCode(code || DEFAULT_DIAL_CODE);
                      setPhoneDraft(number);
                    }}
                    disabled={!!pendingPhone}
                    placeholder="Add a phone number"
                    selectClassName="border border-gray-200 rounded-full px-2 h-[42px] text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all flex-shrink-0"
                    inputClassName="flex-1 min-w-0 px-4 h-[42px] bg-white border border-gray-200 rounded-full text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />

                  {/* A new, not-yet-saved phone number must be confirmed with an
                      OTP before it's written to the database — this box appears
                      as soon as that OTP has been sent, ahead of "Save and
                      Update", so the number can never be changed without it. */}
                  {hasPhoneChange && !pendingPhone && (
                    <button
                      onClick={() => {
                        if (!/^\d{10}$/.test(phoneDraft.trim())) {
                          toast.error("Please enter a valid 10-digit phone number");
                          return;
                        }
                        handleSendPhoneChangeOtp(phoneDraft.trim());
                      }}
                      disabled={phoneChangeSending}
                      className="mt-2 text-xs text-[#0085FF] hover:underline disabled:opacity-40"
                    >
                      {phoneChangeSending ? "Sending OTP..." : "Click here to verify your new phone number"}
                    </button>
                  )}

                  {pendingPhone && !phoneVerified && (
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                      <p className="text-xs text-gray-700 mb-2">
                        Enter the OTP sent to <span className="font-semibold">{pendingPhone}</span> to confirm this number. It won't be saved until verified.
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={phoneChangeOtpValue}
                          onChange={(e) => setPhoneChangeOtpValue(e.target.value)}
                          placeholder="Enter OTP"
                          className="w-32 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={handleConfirmPhoneChangeOtp}
                          disabled={phoneChangeChecking}
                          className="text-xs font-semibold text-[#0085FF] hover:underline disabled:opacity-40"
                        >
                          {phoneChangeChecking ? "Verifying..." : "Verify"}
                        </button>
                        <button
                          onClick={() => handleSendPhoneChangeOtp(pendingPhone)}
                          disabled={phoneChangeSending}
                          className="text-xs text-gray-500 hover:underline disabled:opacity-40"
                        >
                          Resend
                        </button>
                        <button
                          onClick={handleCancelPhoneChange}
                          className="text-xs text-gray-500 hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {pendingPhone && phoneVerified && (
                    <div className="mt-2 flex items-center gap-2">
                      <p className="text-xs font-semibold text-green-600">
                        ✓ {pendingPhone} verified — click Save and Update to confirm.
                      </p>
                      <button
                        onClick={handleCancelPhoneChange}
                        className="text-xs text-gray-500 hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </>
              )}

              {[
                (user.email || user.profileEmail) && !user.isEmailVerified && "email",
                user.phone && !pendingPhone && !hasProfileChanges && !user.isPhoneVerified && "phone",
              ]
                .filter(Boolean)
                .map((target) => (
                  <div key={target} className="mt-2">
                    {verifyTarget === target ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={verifyOtpValue}
                          onChange={(e) => setVerifyOtpValue(e.target.value)}
                          placeholder="Enter OTP"
                          className="w-32 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => handleConfirmVerifyOtp(target)}
                          disabled={verifyChecking}
                          className="text-xs font-semibold text-[#0085FF] hover:underline disabled:opacity-40"
                        >
                          {verifyChecking ? "Verifying..." : "Verify"}
                        </button>
                        <button
                          onClick={() => handleSendVerifyOtp(target)}
                          disabled={verifySending}
                          className="text-xs text-gray-500 hover:underline disabled:opacity-40"
                        >
                          Resend
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          openVerify(target);
                          handleSendVerifyOtp(target);
                        }}
                        className="text-xs text-[#0085FF] hover:underline"
                      >
                        Please click here to verify your {target === "email" ? "email" : "phone number"}
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleSaveProfile}
                disabled={!canSaveAnything || savingName}
                className="px-5 h-[38px] rounded-full bg-[#0085FF] text-white text-[13px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {savingName ? "Saving..." : "Save and Update"}
              </button>

              {/* Connect with Google — links a Google identity to THIS
                  account (verified via Auth0's own /userinfo, see
                  linkGoogleAccount) so it can be signed into afterward
                  either with its original credential (password/phone) or
                  that Google account. */}
              {user.auth0Id && user.auth0Id.startsWith("google-oauth2|") ? (
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-2 px-4 h-[38px] bg-green-50 border border-green-200 rounded-full text-sm text-green-700 font-medium">
                    <GoogleGIcon className="w-4 h-4" />
                    Google account connected
                  </span>
                  <button
                    onClick={handleDisconnectGoogle}
                    disabled={disconnectingGoogle}
                    className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-40"
                  >
                    {disconnectingGoogle ? "Disconnecting..." : "Disconnect"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleConnectGoogle}
                  disabled={connectingGoogle}
                  className="flex items-center gap-2 px-4 h-[38px] bg-white border border-gray-200 rounded-full text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <GoogleGIcon className="w-4 h-4" />
                  {connectingGoogle ? "Connecting..." : "Connect with Google"}
                </button>
              )}
            </div>

            {/* Changing the LOGIN credential itself (email for an
                email/Google-login account, phone for a phone-login one) is
                kept separate from the other, always-editable field above —
                this reveals that credential's own OTP change flow instead
                of just unlocking the input in place. */}
            <p className="block mt-6 text-sm font-semibold text-black">
              Request Something?
            </p>
            {!phoneIsLoginCredential && !showEmailChangeFlow && (
              <p className="block mt-2 text-xs font-semibold text-gray-700">
                Want to change your email?{" "}
                <button
                  onClick={() => openCredentialModal("email")}
                  className="text-[#0085FF] hover:underline"
                >
                  Click here
                </button>
              </p>
            )}
            {phoneIsLoginCredential && !showPhoneChangeFlow && (
              <p className="block mt-2 text-xs font-semibold text-gray-700">
                Want to change your mobile number?{" "}
                <button
                  onClick={() => openCredentialModal("phone")}
                  className="text-[#0085FF] hover:underline"
                >
                  Click here
                </button>
              </p>
            )}

            <p className="block mt-2 text-xs font-semibold text-gray-700">
              Manage login sessions?{" "}
              <button
                onClick={() => setSessionsModalOpen(true)}
                className="text-[#0085FF] hover:underline"
              >
                Click here
              </button>
            </p>

            <p className="block mt-6 text-sm font-semibold text-red-600">
              Danger Zone
            </p>
            <p className="block mt-2 text-xs font-semibold text-gray-700">
              Want to reset your account data?{" "}
              <button
                onClick={() => {
                  setAccountRequestAcknowledged(false);
                  setAccountRequestOrgInput("");
                  setAccountRequestType("reset-data");
                }}
                className="text-[#0085FF] hover:underline"
              >
                Click here
              </button>
            </p>
            <p className="block mt-2 text-xs font-semibold text-gray-700">
              Want to delete your account permanently?{" "}
              <button
                onClick={() => {
                  setAccountRequestAcknowledged(false);
                  setAccountRequestOrgInput("");
                  setAccountRequestType("delete-account");
                }}
                className="text-red-600 hover:underline"
              >
                Click here
              </button>
            </p>
            <p className="block mt-2 text-xs text-gray-500">
              Your request will be processed within 5-7 business days.
            </p>
          </div>

          {/* Image Upload Section */}
          {imagePreview && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg overflow-hidden border-2 border-blue-300">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      New profile image selected
                    </p>
                    <p className="text-xs text-gray-500">
                      {profileImage?.name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={clearImageSelection}
                  className="p-1 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-gray-600" />
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleImageUpload}
                  disabled={uploading}
                  className="flex items-center gap-2 px-4 h-[38px] bg-[#0085FF] text-white text-sm font-semibold rounded-full hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Uploading...
                    </>
                  ) : (
                    <>
                      <UploadIcon className="w-4 h-4" />
                      Upload Image
                    </>
                  )}
                </button>
                <button
                  onClick={clearImageSelection}
                  className="px-4 h-[38px] bg-gray-200 text-gray-700 text-sm font-semibold rounded-full hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Active Sessions panel — reached via the "Manage login sessions?
          Click here" link below Save and Update, instead of always showing
          as its own card on the page. Same right-anchored slide-in panel
          used for Create Company/Deal/Invoice etc. (dc-panel-card/dc-panel-w,
          see src/index.css), not a centered modal. */}
      <div
        className={`fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000] transition-opacity duration-300 ease-in-out ${sessionsModalOpen ? "" : "pointer-events-none"}`}
        style={{ opacity: sessionsModalOpen ? 1 : 0 }}
        onClick={() => setSessionsModalOpen(false)}
      />
      <div
        className={`
          fixed dc-panel-card dc-panel-w z-[10003]
          bg-white shadow-2xl flex flex-col overflow-hidden
          transform transition-transform duration-300 ease-in-out font-inter
          ${sessionsModalOpen ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}
        `}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-gray-500" />
            <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
              Active Sessions
            </h2>
          </div>
          <button
            onClick={() => setSessionsModalOpen(false)}
            title="Close"
            className="w-5 h-5 flex items-center justify-center text-[#1C1B1F] hover:opacity-70 transition-opacity"
            aria-label="Close"
          >
            <X className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
          <p className="text-xs text-gray-500 mb-4">
            You can be signed in on up to 2 devices at once. Sign out of a
            session below to free up a slot for a new one.
          </p>
          {sessionsError && (
            <p className="text-xs text-red-600 mb-3">{sessionsError}</p>
          )}
          {sessions && sessions.length > 0 ? (
            <div className="space-y-2">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Monitor className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {s.deviceLabel || "Unknown device"}
                        {s.current && (
                          <span className="ml-2 text-xs font-semibold text-green-600">
                            This device
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        Last active {new Date(s.lastActiveAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  {!s.current && (
                    <button
                      onClick={() => handleRevokeSession(s.id)}
                      disabled={revokingId === s.id}
                      className="px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {revokingId === s.id ? "Signing out..." : "Sign out"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No active sessions found.</p>
          )}
        </div>
      </div>

      {/* Logout Confirmation Modal */}
      {isLogoutModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl overflow-hidden animate-slideUp">
            <div className="p-6">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <LogOut className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 text-center mb-2">
                Logout Confirmation
              </h3>
              <p className="text-sm text-gray-600 text-center mb-6">
                Are you sure you want to logout? You'll need to sign in again to
                access your account.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsLogoutModalOpen(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors"
                >
                  Yes, Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Remove Photo Confirmation Modal */}
      {isRemovePhotoModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl overflow-hidden animate-slideUp">
            <div className="p-6">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <DeleteIcon className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 text-center mb-2">
                Remove Photo
              </h3>
              <p className="text-sm text-gray-600 text-center mb-6">
                Are you sure you want to remove your profile photo?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsRemovePhotoModalOpen(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRemovePhoto}
                  disabled={uploading}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Yes, Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Danger Zone Confirmation Modal — reset-data / delete-account both
          just file a request for the org's admins (and support, if
          configured) to act on; nothing is performed automatically. The
          reset-data case gets the fuller disclosure (what's lost vs. kept)
          since it's easy to underestimate how much a "reset" wipes. */}
      {accountRequestType && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white max-w-2xl w-full rounded-2xl shadow-2xl overflow-hidden animate-slideUp max-h-[90vh] flex flex-col">
            <div className="p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">
                  {accountRequestType === "delete-account"
                    ? `Are you sure you want to delete ${organizationName}?`
                    : "Confirm Action"}
                </h3>
                <button
                  onClick={() => setAccountRequestType(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {accountRequestType === "reset-data" ? (
                <>
                  <p className="text-xs text-red-600 mb-3">
                    You are performing an action to reset your account. That leads to loss of data in your account. Please make sure and confirm that you want to reset your account.
                  </p>
                  <p className="text-xs font-semibold text-red-600 mb-4">
                    We acknowledge your request and want to inform you that, this action is irreversible and all existing data is erased from your account.
                  </p>

                  <p className="text-xs font-semibold text-gray-900 mb-1">The following data will be lost:-</p>
                  <ul className="text-xs text-red-600 mb-4 space-y-0.5">
                    <li>All your Companies, Deals, Contacts and Vendors</li>
                    <li>All your Invoices, Quotations, Proforma Invoices and Delivery Challans</li>
                    <li>All your Purchases, Purchase Orders and Purchase Returns</li>
                    <li>All your Items, Tasks, Meetings, Notes and Call Logs</li>
                    <li>All other data associated with your account</li>
                  </ul>

                  <p className="text-xs font-semibold text-gray-900 mb-1">The following data will be intact:-</p>
                  <ul className="text-xs text-gray-700 mb-4 space-y-0.5">
                    <li>Your account details, that includes your name, email, mobile number, etc.</li>
                    <li>Your organization details, that includes your organization name, address, etc.</li>
                    <li>Your companies details, that includes settings, preferences and subscription details.</li>
                    <li>Your users and Roles.</li>
                  </ul>

                  <p className="text-xs text-gray-500 mb-4">
                    <span className="font-semibold text-gray-700">Note:-</span> This is a necessary security measure to ensure that the request is authorized by the account owner. We will send you an email notification once the reset has been completed. Thank you for choosing our services, and please do not hesitate to contact us if you have any further questions or concerns.
                  </p>

                  <label className="flex items-start gap-2 mb-6 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={accountRequestAcknowledged}
                      onChange={(e) => {
                        setAccountRequestAcknowledged(e.target.checked);
                        if (!e.target.checked) setAccountRequestOrgInput("");
                      }}
                      className="mt-0.5"
                    />
                    <span className="text-xs text-gray-900">
                      Yes, I read and understood the above information and I am sure that I want to reset my data.
                    </span>
                  </label>

                  {accountRequestAcknowledged && (
                    <div className="mb-6">
                      <p className="text-xs font-semibold text-gray-900 mb-1">
                        Enter your Organization Name to confirm:-
                      </p>
                      <p className="text-xs text-gray-500 mb-2">
                        Please enter <span className="font-bold text-red-600">{organizationName}</span> in the input to reset your account.
                      </p>
                      <input
                        type="text"
                        value={accountRequestOrgInput}
                        onChange={(e) => setAccountRequestOrgInput(e.target.value)}
                        placeholder="Enter your Organization Name"
                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-xs text-red-600 mb-3">
                    You are performing an action to delete your account. That leads to loss of data in your account. Please make sure and confirm that you want to delete your account.
                  </p>
                  <p className="text-xs font-semibold text-red-600 mb-4">
                    We acknowledge your request and want to inform you that, this action is irreversible and all existing data is erased from your account.
                  </p>

                  <p className="text-xs text-gray-500 mb-4">
                    <span className="font-semibold text-gray-700">Note:-</span> This is a necessary security measure to ensure that the request is authorized by the account owner.
                    <br />
                    We will send you an email notification once the deletion has been completed. Thank you for choosing our services, and please do not hesitate to contact us if you have any further questions or concerns.
                  </p>

                  <label className="flex items-start gap-2 mb-6 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={accountRequestAcknowledged}
                      onChange={(e) => {
                        setAccountRequestAcknowledged(e.target.checked);
                        if (!e.target.checked) setAccountRequestOrgInput("");
                      }}
                      className="mt-0.5"
                    />
                    <span className="text-sm text-gray-900">
                      Yes, I read and understood the above information and I am sure that I want to delete my data.
                    </span>
                  </label>

                  {accountRequestAcknowledged && (
                    <div className="mb-6">
                      <p className="text-sm font-semibold text-gray-900 mb-1">
                        Still want to continue?
                      </p>
                      <p className="text-xs text-gray-500 mb-2">
                        Please enter <span className="font-bold text-red-600">{organizationName}</span> in the input to delete your account.
                      </p>
                      <input
                        type="text"
                        value={accountRequestOrgInput}
                        onChange={(e) => setAccountRequestOrgInput(e.target.value)}
                        placeholder={organizationName}
                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                  )}
                </>
              )}

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setAccountRequestType(null);
                    setAccountRequestAcknowledged(false);
                    setAccountRequestOrgInput("");
                  }}
                  className="px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitAccountRequest}
                  disabled={
                    accountRequestSubmitting ||
                    (!!accountRequestType &&
                      (!accountRequestAcknowledged || accountRequestOrgInput.trim() !== organizationName))
                  }
                  className="px-4 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {accountRequestSubmitting ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Credential Change Verification Modal — verifies the request via
          the account's other, already-linked contact method (see
          send/confirmCredentialChangeVerification) before the locked
          credential field (email/phone) is unlocked for editing. */}
      {credentialModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl overflow-hidden animate-slideUp">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">Confirm Action</h3>
                <button
                  onClick={closeCredentialModal}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {credentialModalStep === "confirm" ? (
                <>
                  <p className="text-sm text-gray-700 mb-4">
                    You requested to change your {credentialModalField === "email" ? "email" : "mobile number"}. Please confirm that you want to continue.
                  </p>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6 text-sm">
                    <p className="font-semibold text-gray-900">
                      We'll verify this with an OTP
                    </p>
                    <p className="text-gray-600 mt-1">
                      Sent to your linked {credentialModalField === "email" ? "mobile number" : "email address"} if you have one on file, or to your current {credentialModalField === "email" ? "email" : "mobile number"} otherwise.
                    </p>
                  </div>
                  {credentialModalError && (
                    <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-6 text-sm text-red-700">
                      {credentialModalError}
                    </div>
                  )}
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={closeCredentialModal}
                      className="px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      {credentialModalError ? "Back to Profile" : "Cancel"}
                    </button>
                    {!credentialModalError && (
                      <button
                        onClick={handleSendCredentialVerification}
                        disabled={credentialModalSending}
                        className="px-4 py-2.5 bg-[#0085FF] text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {credentialModalSending ? "Sending..." : "Request OTP"}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-700 mb-4">
                    Enter the OTP sent to{" "}
                    <span className="font-semibold">
                      {credentialModalMasked || `your linked ${credentialModalField === "email" ? "mobile number" : "email"}`}
                    </span>{" "}
                    to confirm this request.
                  </p>
                  <input
                    type="text"
                    value={credentialModalOtpValue}
                    onChange={(e) => setCredentialModalOtpValue(e.target.value)}
                    placeholder="Enter OTP"
                    className="w-full px-4 py-2.5 mb-4 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex justify-between items-center">
                    <button
                      onClick={handleSendCredentialVerification}
                      disabled={credentialModalSending}
                      className="text-xs text-gray-500 hover:underline disabled:opacity-40"
                    >
                      Resend OTP
                    </button>
                    <div className="flex gap-3">
                      <button
                        onClick={closeCredentialModal}
                        className="px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleConfirmCredentialVerification}
                        disabled={credentialModalVerifying}
                        className="px-4 py-2.5 bg-[#0085FF] text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {credentialModalVerifying ? "Verifying..." : "Verify"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add animations to your global CSS or Tailwind config */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default Profile;
import PageSkeleton from "../components/common/PageSkeleton";
import UploadIcon from "../components/common/UploadIcon";
