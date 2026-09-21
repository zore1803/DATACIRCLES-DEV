import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const ForgotPass = () => {
  // ==================================================
  // FORGOT PASSWORD STATE
  // ==================================================
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [isResetSuccess, setIsResetSuccess] = useState(false);
  const [resetOTP, setResetOTP] = useState("");
  const [isVerifyingOTP, setIsVerifyingOTP] = useState(false);

  // ==================================================
  // CREATE NEW PASSWORD STATE
  // ==================================================
  const [isResetPage, setIsResetPage] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const navigate = useNavigate();

  // ==================================================
  // SEND RESET LINK
  // ==================================================
 const handleSendResetLink = async () => {
  setError("");

  if (!email.trim()) {
    setError("Email address is required.");
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    setError("Please enter a valid email address.");
    return;
  }

  try {
    setIsSending(true);

    const response = await fetch(
      "http://localhost:5000/api/auth/forgot-password",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      setError(data.message || "Unable to send reset instructions.");
      return;
    }

    setError("");
    setIsSent(true);
  } catch (error) {
    console.error("Forgot password error:", error);
    setError("Unable to connect to the server. Please try again.");
  } finally {
    setIsSending(false);
  }
};

  // ==================================================
  // VERIFY RESET OTP
  // ==================================================
  const handleVerifyResetOTP = async () => {
    setError("");

    if (!/^\d{6}$/.test(resetOTP)) {
      setError("Please enter the 6-digit verification code.");
      return;
    }

    try {
      setIsVerifyingOTP(true);

      const response = await fetch(
        "http://localhost:5000/api/auth/verify-reset-otp",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            code: resetOTP,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Invalid verification code.");
        return;
      }

      setError("");
      setIsResetPage(true);
    } catch (error) {
      console.error("Reset OTP verification error:", error);
      setError("Unable to connect to the server. Please try again.");
    } finally {
      setIsVerifyingOTP(false);
    }
  };

  // ==================================================
  // RESET PASSWORD
  // ==================================================
  const handleResetPassword = async () => {
    setError("");

    if (!password.trim()) {
      setError("Password is required.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (!confirmPassword.trim()) {
      setError("Please confirm your password.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      const response = await fetch(
        "http://localhost:5000/api/auth/reset-password",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Unable to reset password.");
        return;
      }

      setError("");
      setIsResetSuccess(true);
    } catch (error) {
      console.error("Password reset error:", error);
      setError("Unable to connect to the server. Please try again.");
    }
  };

  // ==================================================
  // LOGIN NAVIGATION
  // ==================================================
  const handleBackToLogin = () => {
    navigate("/login");
  };

  return (
    <div className="h-screen w-full bg-[#EAEAEA] p-0 font-inter overflow-hidden flex items-center justify-center">
      <div
        className="flex w-full h-full items-stretch gap-4 flex-col lg:flex-row"
        style={{ transform: "scale(0.97)", transformOrigin: "center center" }}
      >

       {/* ==================================================
    LEFT SECTION
    ================================================== */}

<div className="relative h-full w-full lg:w-[clamp(360px,33vw,540px)] shrink-0 overflow-hidden rounded-[18px] bg-white hidden lg:block">

  {/* TOP TRANSPARENT IMAGE */}
  <img
    src="/Ellipse 2.png"
    alt=""
    className="absolute left-0 -top-40 z-10 h-auto w-full object-contain"
  />

  {/* BOTTOM TRANSPARENT IMAGE */}
  <img
    src="/Ellipse 1.png"
    alt=""
    className="absolute left-0 z-10 h-[120%] w-full object-contain"
  />

  {/* BOTTOM CONTENT */}
  <div className="absolute bottom-[32px] mb-20 left-1/2 z-20 h-[286px] w-[448px] -translate-x-1/2">

    {/* ICON */}
    <div className="absolute left-[178px] top-0 flex h-[92px] w-[92px] items-center justify-center rounded-[16px] bg-[#0085FF]">

      <svg
        width="40"
        height="40"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M20 10C15.0294 10 11 14.0294 11 19V31.0498C11 31.5743 10.5743 32 10.0498 32C9.798 31.9999 9.557 31.8997 9.3789 31.7217L0 22.3428V26.585L7.2578 33.8428C7.9984 34.5834 9.002 34.9999 10.0498 35C12.2312 35 14 33.2312 14 31.0498V19C14 15.6863 16.6863 13 20 13C23.3137 13 26 15.6863 26 19V31.0498C26 33.2312 27.7688 35 29.9502 35C30.998 34.9999 32.0016 34.5834 32.7422 33.8428L34.707 31.8785L37.707 28.8785L40 26.585V22.3428L37.8789 24.4639L35.585 26.7574L32.585 29.7574L30.6211 31.7217C30.443 31.8997 30.202 31.9999 29.9502 32C29.4257 32 29 31.5743 29 31.0498V19C29 14.0294 24.9706 10 20 10ZM20 15C17.7909 15 16 16.7909 16 19V31.0498C16 34.3358 13.3358 37 10.0498 37C8.472 36.9999 6.958 36.3735 5.8428 35.2578L0 29.4141V33.6562L3.722 37.3789C5.400 39.0572 7.676 39.9999 10.0498 40C14.9926 40 19 35.9926 19 31.0498V19C19 18.4477 19.4477 18 20 18C20.5523 18 21 18.4477 21 19V31.0498C21 35.9926 25.0074 40 29.9502 40C32.324 39.9999 34.6 39.0572 36.278 37.3789L40 33.6562V29.4141L34.1572 35.2578C33.042 36.3734 31.528 36.9999 29.9502 37C26.6642 37 24 34.3358 24 31.0498V19C24 16.7909 22.2091 15 20 15Z"
          fill="#F8FAFC"
        />

        <path
          d="M20 5C12.268 5 6 11.268 6 19V25.1719L9 28.1719V19C9 12.9249 13.9249 8 20 8C26.0751 8 31 12.9249 31 19V28.1719L34 25.1719V19C34 11.268 27.732 5 20 5Z"
          fill="#F8FAFC"
        />

        <path
          d="M20 0C9.5066 0 1 8.5066 1 19V20.1719L4 23.1719V19C4 10.1634 11.1634 3 20 3C28.8366 3 36 10.1634 36 19V23.1719L39 20.1719V19C39 8.5066 30.4934 0 20 0Z"
          fill="#F8FAFC"
        />
      </svg>

    </div>

    {/* DATACIRCLES TEXT */}
    <div className="absolute left-0 top-[122px] w-full text-center">
      <span className="font-inter text-[29px] font-bold leading-none tracking-[-1.5px] text-black">
        One Platform for Every Business and Revenue Decision
      </span>
    </div>

  </div>
</div>

        {/* ==================================================
            RIGHT SECTION
            FULL WIDTH ON MOBILE (LEFT PANEL IS HIDDEN)
            ================================================== */}
       <div className="h-full min-w-0 w-full flex-1 overflow-y-auto rounded-[18px] bg-white">
          {/* CENTERED CONTENT */}
          <div className="flex min-h-0 w-full items-center justify-center overflow-y-auto px-[clamp(12px,4vw,40px)] py-[clamp(16px,3vh,32px)] lg:h-full lg:overflow-y-auto lg:overscroll-contain">

            <div className="relative flex min-h-0 w-full max-w-[449px] flex-col justify-center lg:min-h-full lg:w-full lg:max-w-[449px]">

              {/* ==================================================
                  SCREEN 3 — CREATE NEW PASSWORD
                  ================================================== */}
              {isResetSuccess ? (
                <>

                  {/* ==================================================
                      SCREEN 4 — PASSWORD RESET SUCCESSFULLY
                      ================================================== */}

                 {/* SUCCESS ICON */}
<div className="flex h-[clamp(48px,7vh,56px)] w-[clamp(48px,7vh,56px)] items-center justify-center rounded-full">
  <img
    src="https://ik.imagekit.io/qiap0iq38/DATACIRCLES_PROJECT/signup/Frame%2025%20(1).png"
    alt=""
    className="h-full w-full object-contain"
  />
</div>

                  {/* HEADING */}
                  <h1
                    className="
                      mt-[clamp(14px,2.5vh,20px)]
                      font-['Inter']
                      text-[22px]
                      sm:text-[28px]
                      font-semibold
                      leading-[30px]
                      sm:leading-[36px]
                      tracking-[-0.14px]
                      text-[#0F172A]
                    "
                  >
                    Password Reset Successfully
                  </h1>

                  {/* DESCRIPTION */}
                  <p
                    className="
                      mt-[8px]
                      font-['Inter']
                      text-[15px]
                      sm:text-[18px]
                      font-medium
                      leading-[24px]
                      sm:leading-[28px]
                      text-[#475569]
                    "
                  >
                    Your password has been successfully reset.
                    <br className="hidden md:block" />
                    Click below to log in magically.
                  </p>

                  {/* CONTINUE */}
                  <button
                    type="button"
                    onClick={handleBackToLogin}
                    className="
                      mt-[clamp(20px,4vh,32px)]
                      h-[clamp(42px,5.5vh,48px)]
                      w-full
                      rounded-full
                      bg-[#0085FF]
                      font-['Inter']
                      text-[14px]
                      font-medium
                      leading-[20px]
                      text-white
                      transition
                      hover:bg-[#0078E8]
                    "
                  >
                    Continue
                  </button>

                  {/* BACK TO LOGIN */}
                  <button
                    type="button"
                    onClick={handleBackToLogin}
                    className="
                      mt-[clamp(14px,2.5vh,18px)]
                      w-full
                      font-['Inter']
                      text-[14px]
                      font-medium
                      leading-[20px]
                      text-[#0085FF]
                    "
                  >
                    Back to Login
                  </button>

                  {/* FOOTER */}
                  <div className="relative mt-[clamp(18px,4vh,56px)] w-full lg:mt-[clamp(24px,5vh,56px)] lg:w-full">

                    <div className="h-px w-full bg-[#E2E8F0]" />

                    <div className="mt-[clamp(14px,2.5vh,20px)] flex w-full flex-wrap items-center justify-center gap-3 sm:gap-8 lg:flex-nowrap lg:whitespace-nowrap">

                      <span
                        className="
                          font-['Inter']
                          text-[13px]
                          sm:text-[14px]
                          font-normal
                          leading-[20px]
                          text-[#475569]
                        "
                      >
                        2026 Datacircles. All Rights Reserved.
                      </span>

                      <div className="flex items-center gap-[24px] sm:gap-[32px]">

                        <button
                          type="button"
                          className="
                            font-['Inter']
                            text-[13px]
                            sm:text-[14px]
                            font-normal
                            leading-[20px]
                            text-[#475569]
                          "
                        >
                          Privacy Policy
                        </button>

                        <button
                          type="button"
                          className="
                            font-['Inter']
                            text-[13px]
                            sm:text-[14px]
                            font-normal
                            leading-[20px]
                            text-[#475569]
                          "
                        >
                          Terms of Service
                        </button>

                      </div>
                    </div>
                  </div>

                </>

              ) : isResetPage ? (
                <>

                  {/* TOP SECTION */}
                  <div className="w-full">

                    {/* 56 × 56 ICON */}
                    <div className="h-[clamp(48px,7vh,56px)] w-[clamp(48px,7vh,56px)]">
                      <img
                        src="https://ik.imagekit.io/qiap0iq38/DATACIRCLES_PROJECT/signup/Frame%2026%20(1).png"
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    </div>

                    {/* HEADING */}
                    <h1
                      className="
                        mt-[clamp(14px,2.5vh,20px)]
                        font-['Inter']
                        text-[22px]
                        sm:text-[28px]
                        font-semibold
                        leading-[30px]
                        sm:leading-[36px]
                        tracking-[-0.14px]
                        text-[#0F172A]
                      "
                    >
                      Create New Password
                    </h1>

                    {/* DESCRIPTION */}
                    <p
                      className="
                        mt-[8px]
                        font-['Inter']
                        text-[15px]
                        sm:text-[18px]
                        font-medium
                        leading-[24px]
                        sm:leading-[28px]
                        text-[#475569]
                      "
                    >
                      Your new password must be different from previous
                      <br className="hidden md:block" />
                      used passwords.
                    </p>
                  </div>

                  {/* PASSWORD FORM */}
                  <div className="mt-[clamp(18px,3vh,24px)] w-full">

                    {/* PASSWORD */}
                    <div className="w-full">

                      <label
                        className="
                          block
                          font-['Inter']
                          text-[14px]
                          font-medium
                          leading-[20px]
                          text-[#0F172A]
                        "
                      >
                        Password{" "}
                        <span className="text-[#DC2626]">*</span>
                      </label>

                      <div className="relative mt-[8px]">

                        <input
                          type={
                            showPassword
                              ? "text"
                              : "password"
                          }
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            setError("");
                          }}
                          placeholder="ex.***********"
                          className="
                            h-[clamp(42px,5.5vh,48px)]
                            w-full
                            rounded-full
                            border
                            border-[#E2E8F0]
                            bg-white
                            px-[16px]
                            pr-[45px]
                            font-['Inter']
                            text-[14px]
                            font-normal
                            leading-[20px]
                            text-[#0F172A]
                            outline-none
                            placeholder:text-[#64748B]
                            focus:border-[#0085FF]
                          "
                        />

                        {/* PASSWORD EYE — SVG + FUNCTIONAL */}
                        <button
                          type="button"
                          onClick={() =>
                            setShowPassword(!showPassword)
                          }
                          className="
                            absolute
                            right-[16px]
                            top-1/2
                            -translate-y-1/2
                          "
                          aria-label={
                            showPassword
                              ? "Hide password"
                              : "Show password"
                          }
                        >
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            {showPassword ? (
                              <>
                                <path
                                  d="M3 3L21 21"
                                  stroke="#475569"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                />

                                <path
                                  d="M10.584 10.587C10.209 10.962 10 11.47 10 12C10 13.105 10.895 14 12 14C12.53 14 13.038 13.791 13.413 13.416"
                                  stroke="#475569"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                />

                                <path
                                  d="M9.88 5.09C10.56 4.89 11.27 4.78 12 4.78C18 4.78 21.5 12 21.5 12C21.5 12 20.18 14.65 17.5 16.52M6.53 7.03C4.02 8.91 2.5 12 2.5 12C2.5 12 6 19.22 12 19.22C13.2 19.22 14.33 18.96 15.36 18.53"
                                  stroke="#475569"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </>
                            ) : (
                              <>
                                <path
                                  d="M2.5 12C2.5 12 6 6.5 12 6.5C18 6.5 21.5 12 21.5 12C21.5 12 18 17.5 12 17.5C6 17.5 2.5 12 2.5 12Z"
                                  stroke="#475569"
                                  strokeWidth="1.5"
                                />

                                <circle
                                  cx="12"
                                  cy="12"
                                  r="2.5"
                                  stroke="#475569"
                                  strokeWidth="1.5"
                                />
                              </>
                            )}
                          </svg>
                        </button>

                      </div>
                    </div>

                    {/* CONFIRM PASSWORD */}
                    <div className="mt-[clamp(18px,3vh,25px)] w-full">

                      <label
                        className="
                          block
                          font-['Inter']
                          text-[14px]
                          font-medium
                          leading-[20px]
                          text-[#0F172A]
                        "
                      >
                        Confirm Password{" "}
                        <span className="text-[#DC2626]">*</span>
                      </label>

                      <div className="relative mt-[8px]">

                        <input
                          type={
                            showConfirmPassword
                              ? "text"
                              : "password"
                          }
                          value={confirmPassword}
                          onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            setError("");
                          }}
                          placeholder="ex.***********"
                          className="
                            h-[clamp(42px,5.5vh,48px)]
                            w-full
                            rounded-full
                            border
                            border-[#E2E8F0]
                            bg-white
                            px-[16px]
                            pr-[45px]
                            font-['Inter']
                            text-[14px]
                            font-normal
                            leading-[20px]
                            text-[#0F172A]
                            outline-none
                            placeholder:text-[#64748B]
                            focus:border-[#0085FF]
                          "
                        />

                        {/* CONFIRM PASSWORD EYE — SVG + FUNCTIONAL */}
                        <button
                          type="button"
                          onClick={() =>
                            setShowConfirmPassword(
                              !showConfirmPassword
                            )
                          }
                          className="
                            absolute
                            right-[16px]
                            top-1/2
                            -translate-y-1/2
                          "
                          aria-label={
                            showConfirmPassword
                              ? "Hide confirm password"
                              : "Show confirm password"
                          }
                        >
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            {showConfirmPassword ? (
                              <>
                                <path
                                  d="M3 3L21 21"
                                  stroke="#475569"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                />

                                <path
                                  d="M10.584 10.587C10.209 10.962 10 11.47 10 12C10 13.105 10.895 14 12 14C12.53 14 13.038 13.791 13.413 13.416"
                                  stroke="#475569"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                />

                                <path
                                  d="M9.88 5.09C10.56 4.89 11.27 4.78 12 4.78C18 4.78 21.5 12 21.5 12C21.5 12 20.18 14.65 17.5 16.52M6.53 7.03C4.02 8.91 2.5 12 2.5 12C2.5 12 6 19.22 12 19.22C13.2 19.22 14.33 18.96 15.36 18.53"
                                  stroke="#475569"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </>
                            ) : (
                              <>
                                <path
                                  d="M2.5 12C2.5 12 6 6.5 12 6.5C18 6.5 21.5 12 21.5 12C21.5 12 18 17.5 12 17.5C6 17.5 2.5 12 2.5 12Z"
                                  stroke="#475569"
                                  strokeWidth="1.5"
                                />

                                <circle
                                  cx="12"
                                  cy="12"
                                  r="2.5"
                                  stroke="#475569"
                                  strokeWidth="1.5"
                                />
                              </>
                            )}
                          </svg>
                        </button>

                      </div>
                    </div>

                    {/* RESET PASSWORD BUTTON */}
                    <button
                      type="button"
                      onClick={handleResetPassword}
                      className="
                        mt-[clamp(20px,4vh,32px)]
                        h-[clamp(42px,5.5vh,48px)]
                        w-full
                        rounded-full
                        bg-[#0085FF]
                        font-['Inter']
                        text-[14px]
                        font-medium
                        leading-[20px]
                        text-white
                        transition
                        hover:bg-[#0078E8]
                      "
                    >
                      Reset Password
                    </button>

                    {/* ERROR */}
                    {error && (
                      <div className="mt-[12px] flex items-center gap-[8px]">

                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            cx="12"
                            cy="12"
                            r="9"
                            stroke="#DC2626"
                            strokeWidth="1.8"
                          />

                          <path
                            d="M12 8V12"
                            stroke="#DC2626"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />

                          <circle
                            cx="12"
                            cy="16"
                            r="1"
                            fill="#DC2626"
                          />
                        </svg>

                        <span
                          className="
                            font-['Inter']
                            text-[13px]
                            font-medium
                            leading-[20px]
                            text-[#DC2626]
                          "
                        >
                          {error}
                        </span>

                      </div>
                    )}

                  </div>

                  {/* FOOTER — SAME AS CURRENT FORGOTPASS */}
                  <div className="relative mt-[clamp(18px,4vh,56px)] w-full lg:mt-[clamp(24px,5vh,56px)] lg:w-full">

                    <div className="h-px w-full bg-[#E2E8F0]" />

                    <div className="mt-[clamp(14px,2.5vh,20px)] flex w-full flex-wrap items-center justify-center gap-3 sm:gap-8 lg:flex-nowrap lg:whitespace-nowrap">

                      <span
                        className="
                          font-['Inter']
                          text-[13px]
                          sm:text-[14px]
                          font-normal
                          leading-[20px]
                          text-[#475569]
                        "
                      >
                        2026 Datacircles. All Rights Reserved.
                      </span>

                      <div className="flex items-center gap-[24px] sm:gap-[32px]">

                        <button
                          type="button"
                          className="
                            font-['Inter']
                            text-[13px]
                            sm:text-[14px]
                            font-normal
                            leading-[20px]
                            text-[#475569]
                          "
                        >
                          Privacy Policy
                        </button>

                        <button
                          type="button"
                          className="
                            font-['Inter']
                            text-[13px]
                            sm:text-[14px]
                            font-normal
                            leading-[20px]
                            text-[#475569]
                          "
                        >
                          Terms of Service
                        </button>

                      </div>
                    </div>
                  </div>

                </>
              ) : !isSent ? (

                /* ==================================================
                   SCREEN 1 — FORGOT PASSWORD
                   ================================================== */
                <>

                  {/* TOP SECTION */}
                  <div className="w-full">

                    {/* ICON */}
                    <div className="h-[clamp(48px,7vh,56px)] w-[clamp(48px,7vh,56px)]">
                      <img
                        src="https://ik.imagekit.io/qiap0iq38/DATACIRCLES_PROJECT/signup/Frame%2025.png"
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    </div>

                    {/* HEADING */}
                    <h1
                      className="
                        mt-[clamp(14px,2.5vh,20px)]
                        font-['Inter']
                        text-[22px]
                        sm:text-[28px]
                        font-semibold
                        leading-[30px]
                        sm:leading-[36px]
                        tracking-[-0.14px]
                        text-[#0F172A]
                      "
                    >
                      Forgot your Password?
                    </h1>

                    {/* DESCRIPTION */}
                    <p
                      className="
                        mt-[8px]
                        font-['Inter']
                        text-[15px]
                        sm:text-[18px]
                        font-medium
                        leading-[24px]
                        sm:leading-[28px]
                        text-[#475569]
                      "
                    >
                      No worries, we’ll send you reset instructions.
                    </p>

                  </div>

                  {/* FORM */}
                  <div className="mt-[clamp(18px,3vh,24px)] w-full">

                    {/* EMAIL LABEL */}
                    <label
                      className="
                        block
                        font-['Inter']
                        text-[14px]
                        font-medium
                        leading-[20px]
                        text-[#0F172A]
                      "
                    >
                      Email Address{" "}
                      <span className="text-[#DC2626]">*</span>
                    </label>

                    {/* EMAIL INPUT */}
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setError("");
                      }}
                      placeholder="ex.johndoe@example.com"
                      className={`
                        mt-[8px]
                        h-[clamp(42px,5.5vh,49px)]
                        w-full
                        rounded-full
                        border
                        bg-white
                        px-[16px]
                        font-['Inter']
                        text-[14px]
                        font-normal
                        leading-[20px]
                        text-[#0F172A]
                        outline-none
                        placeholder:text-[#64748B]
                        ${
                          error
                            ? "border-[#DC2626]"
                            : "border-[#E2E8F0] focus:border-[#0085FF]"
                        }
                      `}
                    />

                    {/* ERROR */}
                    {error && (
                      <div className="mt-[8px] flex items-center gap-[8px]">

                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            cx="12"
                            cy="12"
                            r="9"
                            stroke="#DC2626"
                            strokeWidth="1.8"
                          />

                          <path
                            d="M12 8V12"
                            stroke="#DC2626"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />

                          <circle
                            cx="12"
                            cy="16"
                            r="1"
                            fill="#DC2626"
                          />
                        </svg>

                        <span
                          className="
                            font-['Inter']
                            text-[13px]
                            font-medium
                            leading-[20px]
                            text-[#DC2626]
                          "
                        >
                          {error}
                        </span>

                      </div>
                    )}

                    {/* SEND RESET LINK */}
                    <button
                      type="button"
                      onClick={handleSendResetLink}
                      disabled={isSending}
                      className="
                        mt-[16px]
                        h-[clamp(42px,5.5vh,48px)]
                        w-full
                        rounded-full
                        bg-[#0085FF]
                        font-['Inter']
                        text-[14px]
                        font-medium
                        leading-[20px]
                        text-white
                        transition
                        hover:bg-[#0078E8]
                        disabled:cursor-not-allowed
                        disabled:opacity-70
                      "
                    >
                      {isSending
                        ? "Sending..."
                        : "Send Reset Link"}
                    </button>

                    {/* BACK TO LOGIN */}
                    <button
                      type="button"
                      onClick={handleBackToLogin}
                      className="
                        mt-[clamp(14px,2.5vh,18px)]
                        w-full
                        font-['Inter']
                        text-[14px]
                        font-medium
                        leading-[20px]
                        text-[#0085FF]
                      "
                    >
                      Back to Login
                    </button>

                  </div>

                  {/* FOOTER */}
                  <div className="relative mt-[clamp(18px,4vh,56px)] w-full lg:mt-[clamp(24px,5vh,56px)] lg:w-full">

                    <div className="h-px w-full bg-[#E2E8F0]" />

                    <div className="mt-[clamp(14px,2.5vh,20px)] flex w-full flex-wrap items-center justify-center gap-3 sm:gap-8 lg:flex-nowrap lg:whitespace-nowrap">

                      <span
                        className="
                          font-['Inter']
                          text-[13px]
                          sm:text-[14px]
                          font-normal
                          leading-[20px]
                          text-[#475569]
                        "
                      >
                        2026 Datacircles. All Rights Reserved.
                      </span>

                      <div className="flex items-center gap-[24px] sm:gap-[32px]">

                        <button
                          type="button"
                          className="
                            font-['Inter']
                            text-[13px]
                            sm:text-[14px]
                            font-normal
                            leading-[20px]
                            text-[#475569]
                          "
                        >
                          Privacy Policy
                        </button>

                        <button
                          type="button"
                          className="
                            font-['Inter']
                            text-[13px]
                            sm:text-[14px]
                            font-normal
                            leading-[20px]
                            text-[#475569]
                          "
                        >
                          Terms of Service
                        </button>

                      </div>
                    </div>
                  </div>

                </>

              ) : (

                /* ==================================================
                   SCREEN 2 — CHECK YOUR EMAIL
                   ================================================== */
                <>

                  {/* ICON */}
                  <div className="h-[clamp(48px,7vh,56px)] w-[clamp(48px,7vh,56px)]">
                    <img
                      src="https://ik.imagekit.io/qiap0iq38/DATACIRCLES_PROJECT/signup/plus%203.png?updatedAt=1788850900880"
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  </div>

                  {/* HEADING */}
                  <h1
                    className="
                      mt-[clamp(14px,2.5vh,20px)]
                      font-['Inter']
                      text-[22px]
                      sm:text-[28px]
                      font-semibold
                      leading-[30px]
                      sm:leading-[36px]
                      tracking-[-0.14px]
                      text-[#0F172A]
                    "
                  >
                    Check your Email
                  </h1>

                  {/* DESCRIPTION */}
                  <p
                    className="
                      mt-[8px]
                      font-['Inter']
                      text-[15px]
                      sm:text-[18px]
                      font-medium
                      leading-[24px]
                      sm:leading-[28px]
                      text-[#475569]
                    "
                  >
                    We’ve sent a password reset code to your email
                  </p>

                  {/* RESET OTP */}
                  <div className="mt-[clamp(18px,3vh,24px)] w-full">
                    <label
                      className="
                        block
                        font-['Inter']
                        text-[14px]
                        font-medium
                        leading-[20px]
                        text-[#0F172A]
                      "
                    >
                      Verification Code{" "}
                      <span className="text-[#DC2626]">*</span>
                    </label>

                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={resetOTP}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\\D/g, "");
                        setResetOTP(value);
                        setError("");
                      }}
                      placeholder="Enter 6-digit code"
                      className={`
                        mt-[8px]
                        h-[clamp(42px,5.5vh,49px)]
                        w-full
                        rounded-full
                        border
                        bg-white
                        px-[16px]
                        font-['Inter']
                        text-[14px]
                        font-normal
                        leading-[20px]
                        text-[#0F172A]
                        outline-none
                        placeholder:text-[#64748B]
                        ${error
                          ? "border-[#DC2626]"
                          : "border-[#E2E8F0] focus:border-[#0085FF]"
                        }
                      `}
                    />

                    {error && (
                      <div className="mt-[8px] flex items-center gap-[8px]">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            cx="12"
                            cy="12"
                            r="9"
                            stroke="#DC2626"
                            strokeWidth="1.8"
                          />
                          <path
                            d="M12 8V12"
                            stroke="#DC2626"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                          <circle
                            cx="12"
                            cy="16"
                            r="1"
                            fill="#DC2626"
                          />
                        </svg>

                        <span
                          className="
                            font-['Inter']
                            text-[13px]
                            font-medium
                            leading-[20px]
                            text-[#DC2626]
                          "
                        >
                          {error}
                        </span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleVerifyResetOTP}
                      disabled={isVerifyingOTP}
                      className="
                        mt-[16px]
                        h-[clamp(42px,5.5vh,48px)]
                        w-full
                        rounded-full
                        bg-[#0085FF]
                        font-['Inter']
                        text-[14px]
                        font-medium
                        leading-[20px]
                        text-white
                        transition
                        hover:bg-[#0078E8]
                        disabled:cursor-not-allowed
                        disabled:opacity-70
                      "
                    >
                      {isVerifyingOTP ? "Verifying..." : "Verify Code"}
                    </button>
                  </div>

                  {/* SPAM MESSAGE */}
                  <p
                    className="
                      mt-[clamp(14px,2.5vh,18px)]
                      w-full
                      text-center
                      font-['Inter']
                      text-[14px]
                      font-normal
                      leading-[20px]
                      text-[#475569]
                    "
                  >
                    Did you receive the email? If not, check your
                    spam folder.
                  </p>

                  {/* FOOTER */}
                  <div className="relative mt-[clamp(18px,4vh,56px)] w-full lg:mt-[clamp(24px,5vh,56px)] lg:w-full">

                    <div className="h-px w-full bg-[#E2E8F0]" />

                    <div className="mt-[clamp(14px,2.5vh,20px)] flex w-full flex-wrap items-center justify-center gap-3 sm:gap-8 lg:flex-nowrap lg:whitespace-nowrap">

                      <span
                        className="
                          font-['Inter']
                          text-[13px]
                          sm:text-[14px]
                          font-normal
                          leading-[20px]
                          text-[#475569]
                        "
                      >
                        2026 Datacircles. All Rights Reserved.
                      </span>

                      <div className="flex items-center gap-[24px] sm:gap-[32px]">

                        <button
                          type="button"
                          className="
                            font-['Inter']
                            text-[13px]
                            sm:text-[14px]
                            font-normal
                            leading-[20px]
                            text-[#475569]
                          "
                        >
                          Privacy Policy
                        </button>

                        <button
                          type="button"
                          className="
                            font-['Inter']
                            text-[13px]
                            sm:text-[14px]
                            font-normal
                            leading-[20px]
                            text-[#475569]
                          "
                        >
                          Terms of Service
                        </button>

                      </div>
                    </div>
                  </div>

                </>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPass;