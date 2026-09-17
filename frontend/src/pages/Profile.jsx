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

const Profile = () => {
  const { user: auth0User, getAccessTokenSilently, logout } = useAuth0();
  const [user, setUser] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState("");
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
  const [profileImage, setProfileImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [profileBase64, setProfileBase64] = useState(null);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isRemovePhotoModalOpen, setIsRemovePhotoModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sessions, setSessions] = useState(null);
  const [sessionsError, setSessionsError] = useState("");
  const [revokingId, setRevokingId] = useState(null);
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
  const hasProfileChanges = hasNameChange || hasPhoneChange;

  const handleSaveProfile = async () => {
    const trimmedName = nameDraft.trim();
    const trimmedPhone = phoneDraft.trim();

    if (!trimmedName) {
      toast.error("Full name cannot be empty");
      return;
    }
    if (trimmedPhone && !/^\d{10}$/.test(trimmedPhone)) {
      toast.error("Please enter a valid 10-digit phone number");
      return;
    }

    // A changed phone number is never written straight to the database —
    // it's only sent to handleSendPhoneChangeOtp via the "click here to
    // verify" link below, and only reaches the database once that OTP is
    // confirmed (see handleConfirmPhoneChangeOtp). This button only ever
    // saves the name.
    if (!hasNameChange) return;

    setSavingName(true);
    try {
      const res = await API.post("/auth/profile", { name: trimmedName });
      setUser(res.data.user);
      setNameDraft(res.data.user.name || "");
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
      const res = await API.post("/auth/verify-phone-change-otp", {
        phone: pendingPhone,
        otp: phoneChangeOtpValue.trim(),
      });
      setUser(res.data.user);
      setPhoneDraft(res.data.user.phone || "");
      setPendingPhone(null);
      setPhoneChangeOtpValue("");
      toast.success("Phone number updated and verified successfully!");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Invalid or expired OTP. Please try again.");
    } finally {
      setPhoneChangeChecking(false);
    }
  };

  const handleCancelPhoneChange = () => {
    setPendingPhone(null);
    setPhoneChangeOtpValue("");
    setPhoneDraft(user?.phone || "");
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
      {headerTarget ? (
        createPortal(
          <button
            onClick={() => setIsLogoutModalOpen(true)}
            className="flex items-center gap-2 px-4 h-[38px] text-sm font-medium text-red-600 hover:bg-red-50 rounded-full transition-colors whitespace-nowrap"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>,
          headerTarget
        )
      ) : (
        <div className="flex justify-end mb-6">
          <button
            onClick={() => setIsLogoutModalOpen(true)}
            className="flex items-center gap-2 px-4 h-[38px] text-sm font-medium text-red-600 hover:bg-red-50 rounded-full transition-colors whitespace-nowrap"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      )}

      {/* Profile Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Profile Header with Avatar */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 h-32 relative">
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
              </label>
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                disabled={savingName}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-full text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <Mail className="w-4 h-4 text-gray-500" />
                Email Address
              </label>
              <input
                type="email"
                value={user.email || user.profileEmail}
                readOnly
                className="w-full px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-full text-sm text-gray-500 cursor-not-allowed focus:outline-none"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <CellphoneIcon className="w-4 h-4 text-gray-500" />
                Phone Number
              </label>
              <input
                type="tel"
                value={phoneDraft}
                onChange={(e) => setPhoneDraft(e.target.value)}
                disabled={!!pendingPhone}
                placeholder="Add a phone number"
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-full text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

              {pendingPhone && (
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
                      {phoneChangeChecking ? "Verifying..." : "Verify & Save"}
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

          <div className="flex justify-start mb-6">
            <button
              onClick={handleSaveProfile}
              disabled={!hasNameChange || savingName}
              className="px-5 h-[38px] rounded-full bg-[#0085FF] text-white text-[13px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {savingName ? "Saving..." : "Save and Update"}
            </button>
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

      {/* Active Sessions */}
      {sessions && sessions.length > 0 && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900">Active Sessions</h3>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            You can be signed in on up to 2 devices at once. Sign out of a
            session below to free up a slot for a new one.
          </p>
          {sessionsError && (
            <p className="text-xs text-red-600 mb-3">{sessionsError}</p>
          )}
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
        </div>
      )}

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
