import React, { useState, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useNavigate, useLocation } from "react-router-dom";
import API, { configureAxios, establishSession, setCsrfToken } from "../services/api";

// The auth middleware's raw replies ("No token provided", "Invalid token",
// ...) are internal plumbing, not something a person signing in can act on.
// Anything that leaks through gets a plain-language message instead.
const INTERNAL_AUTH_MESSAGES = [
  "no token provided",
  "invalid token",
  "token expired",
  "jwt expired",
  "jwt malformed",
  "unauthorized",
  "authentication failed",
];

const friendlyServerError = (raw, fallback) => {
  const text = String(raw || "").trim();
  if (!text) return fallback;
  if (INTERNAL_AUTH_MESSAGES.some((m) => text.toLowerCase().includes(m))) {
    return "Your session has expired. Please sign in again.";
  }
  return text;
};

export default function UserLogin() {
  const {
    loginWithRedirect,
    isAuthenticated,
    isLoading,
    error,
    getAccessTokenSilently,
    user,
    logout,
  } = useAuth0();
  const navigate = useNavigate();
  const location = useLocation();

  const [showEmailInput, setShowEmailInput] = useState(false);
  const [showSetupForm, setShowSetupForm] = useState(false);
  const [showCodeDisplay, setShowCodeDisplay] = useState(false);
  const [showPhoneInput, setShowPhoneInput] = useState(false);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [showPhoneProfileInput, setShowPhoneProfileInput] = useState(false);
  const [userName, setUserName] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [userOtp, setUserOtp] = useState("");
  const [facebookUserData, setFacebookUserData] = useState(null);
  const [phoneUserData, setPhoneUserData] = useState(null);
  const [emailError, setEmailError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [setupType, setSetupType] = useState("join");
  const [code, setCode] = useState("");
  const [orgName, setOrgName] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [companyCode, setCompanyCode] = useState(null);
  const [tempToken, setTempToken] = useState(null);
  const [isPhoneLogin, setIsPhoneLogin] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);

  const [userEmail, setUserEmail] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailOtpTimer, setEmailOtpTimer] = useState(0);

  // Main screen (new UI) email/password state
  const [showPassword, setShowPassword] = useState(false);
  const [isError, setIsError] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  useEffect(() => {
    configureAxios(getAccessTokenSilently);
  }, [getAccessTokenSilently]);

  useEffect(() => {
    let interval = null;
    if (otpTimer > 0) {
      interval = setInterval(() => {
        setOtpTimer((timer) => timer - 1);
      }, 1000);
    } else if (otpTimer === 0) {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [otpTimer]);

  useEffect(() => {
    let interval = null;
    if (emailOtpTimer > 0) {
      interval = setInterval(() => {
        setEmailOtpTimer((timer) => timer - 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [emailOtpTimer]);

  useEffect(() => {
    if (location.state?.requiresEmail) {
      setShowEmailInput(true);
      setFacebookUserData({
        name: location.state.name || "Unknown",
        provider: location.state.provider || "facebook",
        sub: user?.sub,
      });
    } else if (location.state?.requiresSetup) {
      setShowSetupForm(true);
    } else if (isAuthenticated && !showSetupForm && !showEmailInput) {
      checkAuthStatus();
    }
  }, [isAuthenticated, location.state, user]);

  const checkAuthStatus = async () => {
    try {
      await API.get("/auth/me");
      try {
        await establishSession();
      } catch (sessionErr) {
        if (sessionErr.code === "SESSION_LIMIT_REACHED") {
          setEmailError(sessionErr.message);
          return;
        }
        console.error("Failed to establish DataCircles session:", sessionErr);
      }
      navigate("/");
    } catch (err) {
      const errorData = err.response?.data;
      if (errorData?.error === "EMAIL_REQUIRED" && errorData?.requiresEmail) {
        if (errorData?.provider === "phone") {
          setShowPhoneProfileInput(true);
          setPhoneUserData({
            phone: errorData.phone || userPhone,
            provider: "phone",
          });
        } else {
          setShowEmailInput(true);
          setFacebookUserData({
            name: errorData.name || "Unknown",
            provider: errorData.provider || "facebook",
            sub: user?.sub,
          });
        }
      } else if (errorData?.error === "REGISTRATION_REQUIRED") {
        setShowSetupForm(true);
      } else {
        setEmailError(friendlyServerError(errorData?.message, "Authentication failed"));
      }
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handlePhoneSubmission = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setEmailError("");

    if (!userPhone || userPhone.length !== 10) {
      setEmailError("Please enter a valid 10-digit phone number");
      setIsSubmitting(false);
      return;
    }

    try {
      await API.post("/auth/send-otp", { phone: userPhone });
      setShowPhoneInput(false);
      setShowOtpInput(true);
      setOtpTimer(300);
    } catch (err) {
      setEmailError(friendlyServerError(err.response?.data?.error, "Failed to send OTP"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpSubmission = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setEmailError("");

    try {
      const res = await API.post("/auth/verify-otp", {
        phone: userPhone,
        otp: userOtp,
      });
      if (res.data.success) {
        localStorage.removeItem("superAdminToken");
        localStorage.setItem("token", res.data.token);
        if (res.data.user) localStorage.setItem("user", JSON.stringify(res.data.user));
        configureAxios(() => Promise.resolve(localStorage.getItem("token")));
        if (res.data.csrfToken) {
          setCsrfToken(res.data.csrfToken);
        }
        window.location.href = "/";
      }
    } catch (err) {
      const data = err.response?.data;
      if (data?.code === "SESSION_LIMIT_REACHED") {
        setEmailError(data.message);
      } else if (data?.error === "REGISTRATION_REQUIRED") {
        setTempToken(data.tempToken);
        setIsPhoneLogin(true);
        setShowOtpInput(false);
        setShowPhoneProfileInput(true);
        setPhoneUserData({
          phone: userPhone,
          provider: "phone",
        });
      } else {
        setEmailError(friendlyServerError(data?.message, "Invalid OTP"));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePhoneProfileSubmission = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setEmailError("");

    try {
      const body = {
        email: userEmail,
        name: userName,
        phone: phoneUserData?.phone || userPhone,
      };

      const config = tempToken
        ? { headers: { Authorization: `Bearer ${tempToken}` } }
        : {};

      const res = await API.post("/auth/complete-registration", body, config);
      window.dispatchEvent(new Event("dc:setup-complete"));

      if (res.data.success) {
        if (res.data.token) {
          localStorage.removeItem("superAdminToken");
          localStorage.setItem("token", res.data.token);
          configureAxios(() => Promise.resolve(localStorage.getItem("token")));
        }

        const authRes = await API.get("/auth/me");
        if (authRes.status === 200) {
          navigate("/");
        } else {
          setEmailError("Failed to verify authentication. Please try again.");
        }
      }
    } catch (err) {
      const data = err.response?.data;
      if (data?.message === "Provide company code or organization name") {
        setShowPhoneProfileInput(false);
        setShowSetupForm(true);
        setIsPhoneLogin(true);
      } else if (
        data?.message === "User already exists" ||
        data?.message === "This email is already registered"
      ) {
        setEmailError(
          "This email is already registered. Please use a different email or contact support."
        );
      } else if (data?.message === "Invalid session or user ID") {
        setEmailError("Session expired. Please try logging in again.");
      } else {
        setEmailError(friendlyServerError(data?.message, "Failed to complete registration"));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ==================================================
  // MAIN SCREEN: EMAIL + PASSWORD SIGN IN (new UI form)
  // ==================================================
  const handleLogin = async () => {
    setIsError(false);
    setEmailError("");

    if (!loginEmail.trim() || !loginPassword) {
      setIsError(true);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail.trim())) {
      setIsError(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await API.post("/auth/login", {
        email: loginEmail.trim().toLowerCase(),
        password: loginPassword,
      });

      if (res.data.success) {
        localStorage.removeItem("superAdminToken");
        localStorage.setItem("token", res.data.token);
        if (res.data.user) localStorage.setItem("user", JSON.stringify(res.data.user));
        configureAxios(() => Promise.resolve(localStorage.getItem("token")));
        // Unlike the Auth0/phone-OTP paths (see checkAuthStatus above), this
        // local email+password login never went through establishSession —
        // no dc_session cookie ever got set for it, so GET /session always
        // 401ed and Profile's Active Sessions list stayed empty for every
        // password-login account.
        try {
          await establishSession();
        } catch (sessionErr) {
          if (sessionErr.code === "SESSION_LIMIT_REACHED") {
            setIsError(true);
            setEmailError(sessionErr.message);
            setIsSubmitting(false);
            return;
          }
          console.error("Failed to establish DataCircles session:", sessionErr);
        }
        window.location.href = "/";
      }
    } catch (err) {
      setIsError(true);
      setEmailError(friendlyServerError(err.response?.data?.message, "Login failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendEmailOtp = async () => {
    if (!userEmail) {
      setEmailError("Please enter your email address");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail)) {
      setEmailError("Please enter a valid email address");
      return;
    }

    setIsSubmitting(true);
    setEmailError("");

    try {
      const res = await API.post("/auth/send-email-otp", { email: userEmail });
      if (res.data.success) {
        setEmailOtpSent(true);
        setEmailOtpTimer(600);
        setEmailError("");
      }
    } catch (err) {
      setEmailError(friendlyServerError(err.response?.data?.message, "Failed to send OTP"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyEmailOtp = async () => {
    if (!emailOtp || emailOtp.length !== 6) {
      setEmailError("Please enter the 6-digit OTP");
      return;
    }

    setIsSubmitting(true);
    setEmailError("");

    try {
      const res = await API.post("/auth/verify-email-otp", {
        email: userEmail,
        otp: emailOtp,
      });

      if (res.data.success) {
        setEmailVerified(true);
        setEmailError("");
        setEmailOtp("");
      }
    } catch (err) {
      setEmailError(friendlyServerError(err.response?.data?.message, "Invalid OTP"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailSubmission = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setEmailError("");

    try {
      await API.post("/auth/complete-registration", {
        email: userEmail,
        sub: facebookUserData?.sub || user?.sub,
        name: facebookUserData?.name || user?.name || "Unknown",
      });
      window.dispatchEvent(new Event("dc:setup-complete"));

      const authRes = await API.get("/auth/me");
      if (authRes.status === 200) {
        navigate("/");
      } else {
        setEmailError("Failed to verify authentication. Please try again.");
      }
    } catch (err) {
      const data = err.response?.data;
      if (data?.message === "Provide company code or organization name") {
        setShowEmailInput(false);
        setShowSetupForm(true);
      } else if (data?.message === "User already exists") {
        setEmailError(
          "This email is already registered. Please use a different email or contact support."
        );
      } else if (data?.message === "Invalid session or user ID") {
        setEmailError("Session expired. Please try logging in again.");
      } else {
        setEmailError(friendlyServerError(data?.message, "Failed to complete registration"));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetupSubmission = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setEmailError("");

    try {
      const body = {
        sub: isPhoneLogin ? null : facebookUserData?.sub || user?.sub,
        name: isPhoneLogin
          ? userName
          : facebookUserData?.name || user?.name || "Unknown",
      };

      if (facebookUserData || isPhoneLogin) {
        body.email = userEmail;
      } else if (user?.email) {
        body.email = user.email;
      }

      if (setupType === "join") {
        if (!code.trim()) {
          setEmailError("Company code is required");
          setIsSubmitting(false);
          return;
        }
        body.code = code;
      } else {
        if (!orgName.trim()) {
          setEmailError("Organization name is required");
          setIsSubmitting(false);
          return;
        }
        body.orgName = orgName;
        if (gstNumber.trim()) body.gstNumber = gstNumber.trim();
        const storedReferralCode = localStorage.getItem("referralCode");
        if (storedReferralCode) {
          body.referralCode = storedReferralCode;
        }
      }

      const config = tempToken
        ? { headers: { Authorization: `Bearer ${tempToken}` } }
        : {};
      const res = await API.post("/auth/complete-registration", body, config);
      window.dispatchEvent(new Event("dc:setup-complete"));
      localStorage.removeItem("referralCode");

      if (res.data.token) {
        localStorage.removeItem("superAdminToken");
        localStorage.setItem("token", res.data.token);
        configureAxios(() => Promise.resolve(localStorage.getItem("token")));
      }

      if (res.data.companyCode) {
        setCompanyCode(res.data.companyCode);
        setShowCodeDisplay(true);
      } else {
        try {
          const subRes = await API.get("/subscription/current");
          const sub = subRes.data;
          if (!sub || sub.hasSubscription === false) {
            navigate("/subscription");
          } else {
            navigate("/");
          }
        } catch (subErr) {
          if (subErr.response?.data?.code === "NO_SUBSCRIPTION") {
            navigate("/subscription");
          } else {
            navigate("/");
          }
        }
      }
      setShowSetupForm(false);
    } catch (err) {
      const data = err.response?.data;
      if (err.response?.status === 403 && data?.joinMethod === "code") {
        setEmailError(
          data?.message ||
            "This company already has the maximum number of users allowed. You cannot join this account. Please go back and join a different company, or create a new one."
        );
      } else {
        setEmailError(friendlyServerError(data?.message || data?.error, "Failed to complete setup"));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#EAEAEA]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#0085FF] border-t-transparent" />
      </div>
    );
  }

  if (showPhoneInput) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8 p-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-green-600 to-green-700 rounded-2xl mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Phone Authentication</h2>
            <p className="text-gray-600">Enter your phone number to receive an OTP</p>
          </div>
          <form onSubmit={handlePhoneSubmission} className="space-y-6">
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                  +91
                </span>
                <input
                  id="phone"
                  type="tel"
                  required
                  value={userPhone}
                  onChange={(e) => setUserPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-r-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="Enter 10-digit number"
                  disabled={isSubmitting}
                />
              </div>
              {emailError && <p className="mt-2 text-sm text-red-600">{emailError}</p>}
            </div>
            <div className="space-y-3">
              <button
                type="submit"
                disabled={isSubmitting || userPhone.length !== 10}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Sending..." : "Send OTP"}
              </button>
              <button
                type="button"
                onClick={() => setShowPhoneInput(false)}
                className="w-full py-3 px-4 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                Back to Login
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (showOtpInput) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8 p-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-green-600 to-green-700 rounded-2xl mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Verify OTP</h2>
            <p className="text-gray-600 mb-2">Enter the 4-digit code sent to +91{userPhone}</p>
            {otpTimer > 0 && <p className="text-sm text-green-600">Code expires in: {formatTime(otpTimer)}</p>}
          </div>
          <form onSubmit={handleOtpSubmission} className="space-y-6">
            <div>
              <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-2">OTP</label>
              <input
                id="otp"
                type="text"
                required
                maxLength={4}
                name="otp-nofill"
                inputMode="numeric"
                autoComplete="one-time-code"
                data-lpignore="true"
                data-1p-ignore="true"
                value={userOtp}
                onChange={(e) => setUserOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 text-center text-2xl tracking-widest"
                placeholder="0000"
                disabled={isSubmitting}
              />
              {emailError && <p className="mt-2 text-sm text-red-600">{emailError}</p>}
            </div>
            <div className="space-y-3">
              <button
                type="submit"
                disabled={isSubmitting || userOtp.length !== 4}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Verifying..." : "Verify OTP"}
              </button>
              {otpTimer === 0 && (
                <button
                  type="button"
                  onClick={handlePhoneSubmission}
                  className="w-full py-3 px-4 border border-gray-300 rounded-xl text-sm font-medium text-green-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  Resend OTP
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowOtpInput(false);
                  setShowPhoneInput(true);
                  setUserOtp("");
                  setOtpTimer(0);
                }}
                className="w-full py-3 px-4 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                Back to Phone
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (showPhoneProfileInput) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8 p-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-green-600 to-green-700 rounded-2xl mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Complete Your Profile</h2>
            <p className="text-gray-600">Phone verified successfully! Please provide your details to continue.</p>
          </div>
          <form onSubmit={handlePhoneProfileSubmission} className="space-y-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
              <input
                id="name"
                type="text"
                required
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="Enter your full name"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address {emailVerified && <span className="text-green-600 text-sm ml-2">✓ Verified</span>}
              </label>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    id="email"
                    type="email"
                    required
                    value={userEmail}
                    onChange={(e) => {
                      setUserEmail(e.target.value);
                      setEmailOtpSent(false);
                      setEmailVerified(false);
                      setEmailOtp("");
                    }}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="Enter your email address"
                    disabled={isSubmitting || emailVerified}
                  />
                  {!emailOtpSent && !emailVerified && (
                    <button
                      type="button"
                      onClick={handleSendEmailOtp}
                      disabled={isSubmitting || !userEmail}
                      className="px-6 py-3 border border-green-600 text-green-600 rounded-xl text-sm font-medium hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {isSubmitting ? "Sending..." : "Send OTP"}
                    </button>
                  )}
                </div>

                {emailOtpSent && !emailVerified && (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        maxLength={6}
                        value={emailOtp}
                        onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        className="flex-1 px-4 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 text-center text-xl tracking-widest"
                        placeholder="000000"
                        disabled={isSubmitting}
                      />
                      <button
                        type="button"
                        onClick={handleVerifyEmailOtp}
                        disabled={isSubmitting || emailOtp.length !== 6}
                        className="px-6 py-3 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {isSubmitting ? "Verifying..." : "Verify"}
                      </button>
                    </div>
                    {emailOtpTimer > 0 && (
                      <p className="text-sm text-green-600 text-center">
                        Code expires in: {Math.floor(emailOtpTimer / 60)}:{String(emailOtpTimer % 60).padStart(2, "0")}
                      </p>
                    )}
                    {emailOtpTimer === 0 && (
                      <button
                        type="button"
                        onClick={handleSendEmailOtp}
                        className="w-full py-2 text-sm text-green-600 hover:text-green-700 font-medium"
                      >
                        Resend OTP
                      </button>
                    )}
                  </div>
                )}
              </div>
              {emailError && <p className="mt-2 text-sm text-red-600">{emailError}</p>}
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Phone:</span> +91{phoneUserData?.phone || userPhone}
              </p>
            </div>
            <div className="space-y-3">
              <button
                type="submit"
                disabled={isSubmitting || !emailVerified}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Processing..." : emailVerified ? "Continue" : "Verify Email First"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPhoneProfileInput(false);
                  setShowPhoneInput(true);
                  setUserName("");
                  setUserEmail("");
                  setTempToken(null);
                  setIsPhoneLogin(false);
                }}
                className="w-full py-3 px-4 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (showEmailInput) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8 p-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl mb-4">
              <svg className="w-8 h-8 text-white" fill="#1877F2" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Complete Your Profile</h2>
            <p className="text-gray-600">Hi {facebookUserData?.name || "User"}! Please provide your email address to continue.</p>
          </div>
          <form onSubmit={handleEmailSubmission} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address {emailVerified && <span className="text-green-600 text-sm ml-2">✓ Verified</span>}
              </label>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    id="email"
                    type="email"
                    required
                    value={userEmail}
                    onChange={(e) => {
                      setUserEmail(e.target.value);
                      setEmailOtpSent(false);
                      setEmailVerified(false);
                      setEmailOtp("");
                    }}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter your email address"
                    disabled={isSubmitting || emailVerified}
                  />
                  {!emailOtpSent && !emailVerified && (
                    <button
                      type="button"
                      onClick={handleSendEmailOtp}
                      disabled={isSubmitting || !userEmail}
                      className="px-6 py-3 border border-blue-600 text-blue-600 rounded-xl text-sm font-medium hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {isSubmitting ? "Sending..." : "Send OTP"}
                    </button>
                  )}
                </div>

                {emailOtpSent && !emailVerified && (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        maxLength={6}
                        value={emailOtp}
                        onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        className="flex-1 px-4 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center text-xl tracking-widest"
                        placeholder="000000"
                        disabled={isSubmitting}
                      />
                      <button
                        type="button"
                        onClick={handleVerifyEmailOtp}
                        disabled={isSubmitting || emailOtp.length !== 6}
                        className="px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {isSubmitting ? "Verifying..." : "Verify"}
                      </button>
                    </div>
                    {emailOtpTimer > 0 && (
                      <p className="text-sm text-blue-600 text-center">
                        Code expires in: {Math.floor(emailOtpTimer / 60)}:{String(emailOtpTimer % 60).padStart(2, "0")}
                      </p>
                    )}
                    {emailOtpTimer === 0 && (
                      <button
                        type="button"
                        onClick={handleSendEmailOtp}
                        className="w-full py-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Resend OTP
                      </button>
                    )}
                  </div>
                )}
              </div>
              {emailError && <p className="mt-2 text-sm text-red-600">{emailError}</p>}
            </div>
            <div className="space-y-3">
              <button
                type="submit"
                disabled={isSubmitting || !emailVerified}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Processing..." : emailVerified ? "Continue" : "Verify Email First"}
              </button>
              <button
                type="button"
                onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                className="w-full py-3 px-4 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (showSetupForm) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-white">
        <div className="max-w-md w-full space-y-8 p-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl overflow-hidden mb-4">
              <img src="/dc.png" alt="" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Set Up Your Company</h2>
            <p className="text-gray-600">Join an existing company or create a new one to get started.</p>
          </div>
          {isPhoneLogin && (
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                <input
                  id="name"
                  type="text"
                  required
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter your full name"
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                <input
                  id="email"
                  type="email"
                  required
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter your email address"
                  disabled={isSubmitting}
                />
              </div>
            </div>
          )}
          <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
            <button
              onClick={() => setSetupType("join")}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${setupType === "join" ? "bg-white shadow-sm text-gray-900" : "text-gray-600"}`}
            >
              Join Existing
            </button>
            <button
              onClick={() => setSetupType("create")}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${setupType === "create" ? "bg-white shadow-sm text-gray-900" : "text-gray-600"}`}
            >
              Create New
            </button>
          </div>
          <form onSubmit={handleSetupSubmission} className="space-y-6">
            <div>
              <label htmlFor="setupInput" className="block text-sm font-medium text-gray-700 mb-2">
                {setupType === "join" ? "Company Code" : "Organization Name"}
              </label>
              <input
                id="setupInput"
                type="text"
                required
                name={`setup-${setupType}-nofill`}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                value={setupType === "join" ? code : orgName}
                onChange={(e) => (setupType === "join" ? setCode(e.target.value) : setOrgName(e.target.value))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder={setupType === "join" ? "Enter company code" : "Enter organization name"}
                disabled={isSubmitting}
              />
              {setupType === "create" && (
                <div className="mt-4">
                  <label htmlFor="gstInput" className="block text-sm font-medium text-gray-700 mb-2">GST Number (Optional)</label>
                  <input
                    id="gstInput"
                    type="text"
                    value={gstNumber}
                    onChange={(e) => setGstNumber(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter GST Number"
                    disabled={isSubmitting}
                  />
                </div>
              )}
              {emailError && <p className="mt-2 text-sm text-red-600">{emailError}</p>}
            </div>
            <div className="space-y-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Processing..." : "Continue"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (tempToken) {
                    setShowSetupForm(false);
                    setShowPhoneProfileInput(true);
                    setIsPhoneLogin(false);
                  } else {
                    logout({ logoutParams: { returnTo: window.location.origin } });
                  }
                }}
                className="w-full py-3 px-4 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (showCodeDisplay) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8 p-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Company Created Successfully</h2>
            <p className="text-gray-600 mb-4">Share this unique code with your team members to invite them to join.</p>
            <div className="bg-gray-50 p-4 rounded-xl text-center font-mono text-xl text-blue-600 border border-gray-200">
              {companyCode}
            </div>
          </div>
          <button
            onClick={() => (window.location.href = "/")}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ==================================================
  // MAIN SCREEN — new design
  // ==================================================
  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#EAEAEA] p-2 font-inter sm:p-4">
      <div className="flex h-full w-full flex-col items-stretch gap-4 lg:flex-row">

        {/* LEFT SECTION — hidden on mobile */}
        <div className="relative hidden h-full w-[46%] shrink-0 overflow-hidden rounded-[18px] bg-white lg:block">
          <img src="/Ellipse 2.png" alt="" className="absolute left-0 -top-40 z-10 h-auto w-full object-contain" />
          <img src="/Ellipse 1.png" alt="" className="absolute left-0 z-10 h-[120%] w-full object-contain" />
          <div className="absolute bottom-[32px] left-1/2 z-20 mb-20 h-[286px] w-[448px] -translate-x-1/2">
            <div className="absolute left-[178px] top-0 flex h-[92px] w-[92px] items-center justify-center rounded-[16px] bg-[#0085FF]">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" clipRule="evenodd" d="M20 10C15.0294 10 11 14.0294 11 19V31.0498C11 31.5743 10.5743 32 10.0498 32C9.798 31.9999 9.557 31.8997 9.3789 31.7217L0 22.3428V26.585L7.2578 33.8428C7.9984 34.5834 9.002 34.9999 10.0498 35C12.2312 35 14 33.2312 14 31.0498V19C14 15.6863 16.6863 13 20 13C23.3137 13 26 15.6863 26 19V31.0498C26 33.2312 27.7688 35 29.9502 35C30.998 34.9999 32.0016 34.5834 32.7422 33.8428L34.707 31.8785L37.707 28.8785L40 26.585V22.3428L37.8789 24.4639L35.585 26.7574L32.585 29.7574L30.6211 31.7217C30.443 31.8997 30.202 31.9999 29.9502 32C29.4257 32 29 31.5743 29 31.0498V19C29 14.0294 24.9706 10 20 10ZM20 15C17.7909 15 16 16.7909 16 19V31.0498C16 34.3358 13.3358 37 10.0498 37C8.472 36.9999 6.958 36.3735 5.8428 35.2578L0 29.4141V33.6562L3.722 37.3789C5.400 39.0572 7.676 39.9999 10.0498 40C14.9926 40 19 35.9926 19 31.0498V19C19 18.4477 19.4477 18 20 18C20.5523 18 21 18.4477 21 19V31.0498C21 35.9926 25.0074 40 29.9502 40C32.324 39.9999 34.6 39.0572 36.278 37.3789L40 33.6562V29.4141L34.1572 35.2578C33.042 36.3734 31.528 36.9999 29.9502 37C26.6642 37 24 34.3358 24 31.0498V19C24 16.7909 22.2091 15 20 15Z" fill="#F8FAFC" />
                <path d="M20 5C12.268 5 6 11.268 6 19V25.1719L9 28.1719V19C9 12.9249 13.9249 8 20 8C26.0751 8 31 12.9249 31 19V28.1719L34 25.1719V19C34 11.268 27.732 5 20 5Z" fill="#F8FAFC" />
                <path d="M20 0C9.5066 0 1 8.5066 1 19V20.1719L4 23.1719V19C4 10.1634 11.1634 3 20 3C28.8366 3 36 10.1634 36 19V23.1719L39 20.1719V19C39 8.5066 30.4934 0 20 0Z" fill="#F8FAFC" />
              </svg>
            </div>
            <div className="absolute left-0 top-[122px] w-full text-center">
              <span className="font-inter text-[29px] font-bold leading-none tracking-[-1.5px] text-black">
                One Platform for Every Business and Revenue Decision
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT SECTION */}
        <div className="h-full w-full min-w-0 flex-1 overflow-y-auto rounded-[18px] bg-white">
          <div className="flex h-full min-h-full w-full flex-col items-center px-4 py-6 sm:px-6 lg:px-4">
            <div className="my-auto h-auto w-full max-w-[449px]">

              {/* TOP SECTION */}
              <div className="w-full">
                <div className="h-[32px] w-[32px]">
                  <img
                    src="https://ik.imagekit.io/qiap0iq38/DATACIRCLES_PROJECT/signup/Logo.png"
                    alt="logo"
                    className="h-[32px] w-[32px] object-contain"
                  />
                </div>
                <h1 className="mt-[16px] font-['Inter'] text-[26px] font-semibold leading-[32px] tracking-[-0.14px] text-[#0F172A]">
                  Welcome Back
                </h1>
                <p className="mt-[6px] font-['Inter'] text-[15px] font-medium leading-[22px] text-[#475569]">
                  Sign in to your account to continue managing your business workflows.
                </p>
              </div>

              {/* FORM */}
              <div className="mt-[20px] w-full">
                {error && (
                  <div className="mb-[16px] flex items-start gap-2 rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3">
                    <span className="font-['Inter'] text-[13px] text-[#DC2626]">{error.message}</span>
                  </div>
                )}

                {/* EMAIL */}
                <div className="w-full">
                  <label className="block font-['Inter'] text-[14px] font-medium leading-[20px] text-[#0F172A]">
                    Work email <span className="text-[#DC2626]">*</span>
                  </label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => {
                      setLoginEmail(e.target.value);
                      setIsError(false);
                    }}
                    placeholder="ex.johndoe@example.com"
                    className={`mt-[8px] h-[46px] w-full rounded-full border bg-white px-[16px] font-['Inter'] text-[14px] font-normal leading-[20px] text-[#0F172A] outline-none placeholder:text-[#64748B] ${
                      isError ? "border-[#DC2626]" : "border-[#E2E8F0] focus:border-[#0085FF]"
                    }`}
                  />
                </div>

                {/* PASSWORD */}
                <div className="mt-[18px] w-full">
                  <label className="block font-['Inter'] text-[14px] font-medium leading-[20px] text-[#0F172A]">
                    Password <span className="text-[#DC2626]">*</span>
                  </label>
                  <div className="relative mt-[8px]">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={loginPassword}
                      onChange={(e) => {
                        setLoginPassword(e.target.value);
                        setIsError(false);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                      placeholder="ex.**********"
                      className={`h-[46px] w-full rounded-full border bg-white px-[16px] pr-[45px] font-['Inter'] text-[14px] font-normal leading-[20px] text-[#0F172A] outline-none placeholder:text-[#64748B] ${
                        isError ? "border-[#DC2626]" : "border-[#E2E8F0] focus:border-[#0085FF]"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-[16px] top-1/2 -translate-y-1/2"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        {showPassword ? (
                          <>
                            <path d="M3 3L21 21" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />
                            <path d="M10.584 10.587C10.209 10.962 10 11.47 10 12C10 13.105 10.895 14 12 14C12.53 14 13.038 13.791 13.413 13.416" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />
                            <path d="M9.88 5.09C10.56 4.89 11.27 4.78 12 4.78C18 4.78 21.5 12 21.5 12C21.5 12 20.18 14.65 17.5 16.52M6.53 7.03C4.02 8.91 2.5 12 2.5 12C2.5 12 6 19.22 12 19.22C13.2 19.22 14.33 18.96 15.36 18.53" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </>
                        ) : (
                          <>
                            <path d="M2.5 12C2.5 12 6 6.5 12 6.5C18 6.5 21.5 12 21.5 12C21.5 12 18 17.5 12 17.5C6 17.5 2.5 12 2.5 12Z" stroke="#475569" strokeWidth="1.5" />
                            <circle cx="12" cy="12" r="2.5" stroke="#475569" strokeWidth="1.5" />
                          </>
                        )}
                      </svg>
                    </button>
                  </div>
                </div>

                {/* FORGOT PASSWORD */}
                <div className="mt-[10px] flex justify-end">
                  <button
                    type="button"
                    onClick={() => navigate("/forgot-password")}
                    className="cursor-pointer font-['Inter'] text-[14px] font-medium leading-[20px] text-[#0085FF]"
                  >
                    Forgot Password?
                  </button>
                </div>

                {/* ERROR MESSAGE */}
                {isError && (
                  <div className="mt-[10px] flex items-center gap-[8px]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="9" stroke="#DC2626" strokeWidth="1.8" />
                      <path d="M12 8V12" stroke="#DC2626" strokeWidth="1.8" strokeLinecap="round" />
                      <circle cx="12" cy="16" r="1" fill="#DC2626" />
                    </svg>
                    <span className="font-['Inter'] text-[13px] font-medium leading-[20px] text-[#DC2626]">
                      {emailError || "Please enter a valid email and password."}
                    </span>
                  </div>
                )}

                {/* SIGN IN BUTTON */}
                <button
                  type="button"
                  onClick={handleLogin}
                  disabled={isSubmitting}
                  className="mt-[20px] h-[46px] w-full rounded-full bg-[#0085FF] font-['Inter'] text-[14px] font-medium leading-[20px] text-white transition hover:bg-[#0078E8] disabled:opacity-60"
                >
                  {isSubmitting ? "Signing in..." : "Sign In"}
                </button>
              </div>

              {/* SOCIAL LOGIN */}
              <div className="mt-[20px] w-full">
                <div className="flex w-full items-center">
                  <div className="h-px flex-1 bg-[#E2E8F0]" />
                  <span className="mx-[16px] whitespace-nowrap font-['Inter'] text-[14px] font-normal leading-[20px] text-[#64748B]">
                    or continue with
                  </span>
                  <div className="h-px flex-1 bg-[#E2E8F0]" />
                </div>

                <div className="mt-[16px] flex h-[42px] items-center justify-center gap-[6px]">
                  {/* GOOGLE */}
                  <button
                    type="button"
                    onClick={() => loginWithRedirect({ authorizationParams: { connection: "google-oauth2" } })}
                    className="flex h-[42px] w-[42px] items-center justify-center"
                  >
                    <img src="https://ik.imagekit.io/qiap0iq38/DATACIRCLES_PROJECT/signup/Rectangle%2034624569.png" alt="Google" className="h-[42px] w-[42px]" />
                  </button>

                  {/* GITHUB */}
                  <button
                    type="button"
                    onClick={() => loginWithRedirect({ authorizationParams: { connection: "github" } })}
                    className="flex h-[42px] w-[42px] items-center justify-center"
                  >
                    <img src="https://ik.imagekit.io/qiap0iq38/DATACIRCLES_PROJECT/signup/Rectangle%2034624566.png" alt="Github" className="h-[42px] w-[42px]" />
                  </button>

                  {/* FACEBOOK */}
                  <button
                    type="button"
                    onClick={() => loginWithRedirect({ authorizationParams: { connection: "facebook", scope: "openid profile email" } })}
                    className="flex h-[42px] w-[42px] items-center justify-center"
                  >
                    <img src="https://ik.imagekit.io/qiap0iq38/DATACIRCLES_PROJECT/signup/Rectangle%2034624567.png" alt="Facebook" className="h-[42px] w-[42px]" />
                  </button>

                  {/* PHONE */}
                  <button
                    type="button"
                    onClick={() => setShowPhoneInput(true)}
                    className="flex h-[42px] w-[42px] items-center justify-center"
                  >
                    <img src="https://ik.imagekit.io/qiap0iq38/DATACIRCLES_PROJECT/signup/Rectangle%2034624568.png" alt="Phone" className="h-[42px] w-[42px]" />
                  </button>
                </div>

                {/* REGISTER */}
                <div className="mt-[16px] flex justify-center">
                  <p className="text-center font-['Inter'] text-[14px] font-normal leading-[20px] text-[#0F172A]">
                    Don't have an account?{" "}
                    <button
                      type="button"
                      onClick={() => navigate("/register")}
                      className="ml-[3px] cursor-pointer font-['Inter'] text-[14px] font-semibold leading-[20px] text-[#0085FF]"
                    >
                      Get Started
                    </button>
                  </p>
                </div>

                {/* SUPER ADMIN / SUPPORT */}
                <div className="mt-[10px] flex flex-wrap items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => navigate("/super-admin/login")}
                    className="font-['Inter'] text-[13px] font-medium text-[#0085FF] hover:text-[#0078E8]"
                  >
                    Login as Super Admin
                  </button>
                  <span className="text-[#E2E8F0]">|</span>
                  <button
                    type="button"
                    onClick={() => navigate("/super-admin/supporrt")}
                    className="font-['Inter'] text-[13px] font-medium text-[#0085FF] hover:text-[#0078E8]"
                  >
                    Contact Support
                  </button>
                </div>

                {/* FOOTER */}
                <div className="mt-[16px] w-full justify-center">
                  <div className="h-px w-full bg-[#E2E8F0]" />
                  <div className="mt-[14px] flex w-full flex-wrap items-center justify-center gap-4 sm:gap-8">
                    <span className="font-['Inter'] text-[13px] font-normal leading-[20px] text-[#475569]">
                      2026 Datacircles. All Rights Reserved.
                    </span>
                    <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-[32px]">
                      <button type="button" className="font-['Inter'] text-[13px] font-normal leading-[20px] text-[#475569]">
                        Privacy Policy
                      </button>
                      <button type="button" className="font-['Inter'] text-[13px] font-normal leading-[20px] text-[#475569]">
                        Terms of Service
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
