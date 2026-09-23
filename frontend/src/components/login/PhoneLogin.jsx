import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../../services/api";

// Wired up from the "Phone" icon on UserLogin/UserRegister's "or continue with" row —
// that icon had no onClick at all until now. Two steps in one component (phone number,
// then the OTP it texts you) rather than two routes, same shape as the rest of this
// flow's single-purpose pages.
//
// Backend contract (authController.sendOtp/verifyOtp, both pre-existing — this is the
// first frontend page to ever call them): the OTP is 4 digits, not 6 like the email one.
// verifyOtp returns a real session on success, but a 428 REGISTRATION_REQUIRED for a
// phone with no existing account — that path needs a temp-token-driven "join or create an
// organization" step (completeRegistration) that has no UI anywhere in this app yet, so
// it's surfaced here as a plain message pointing at email registration instead of a dead
// end with no explanation.
export default function PhoneLogin() {
  const navigate = useNavigate();

  const [step, setStep] = useState("phone"); // "phone" | "otp" | "password"
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [isSending, setIsSending] = useState(false);

  const [code, setCode] = useState(["", "", "", ""]);
  const [timeLeft, setTimeLeft] = useState(39);
  const [otpError, setOtpError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [needsRegistration, setNeedsRegistration] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const inputRefs = useRef([]);

  useEffect(() => {
    if (step !== "otp" || timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [step, timeLeft]);

  const handleSendCode = async () => {
    setPhoneError("");
    if (!/^\d{10}$/.test(phone.trim())) {
      setPhoneError("Enter a valid 10-digit phone number.");
      return;
    }
    try {
      setIsSending(true);
      await API.post("/auth/send-otp", { phone: phone.trim() });
      setStep("otp");
      setTimeLeft(39);
      setCode(["", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 0);
    } catch (error) {
      setPhoneError(error.response?.data?.message || "Unable to send code. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const handleCodeChange = (value, index) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    if (value && index < 3) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (event, index) => {
    if (event.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (!pasted) return;
    const newCode = ["", "", "", ""];
    pasted.split("").forEach((digit, index) => { newCode[index] = digit; });
    setCode(newCode);
    inputRefs.current[Math.min(pasted.length, 3)]?.focus();
  };

  const handleResend = async () => {
    if (timeLeft > 0) return;
    try {
      await API.post("/auth/send-otp", { phone: phone.trim() });
      setCode(["", "", "", ""]);
      setTimeLeft(39);
      inputRefs.current[0]?.focus();
    } catch (error) {
      console.error("Resend OTP request failed:", error);
    }
  };

  const handleVerify = async () => {
    const enteredCode = code.join("");
    if (enteredCode.length !== 4 || isVerifying) return;

    try {
      setIsVerifying(true);
      setOtpError("");
      const res = await API.post("/auth/verify-otp", { phone: phone.trim(), otp: enteredCode });
      localStorage.setItem("token", res.data.token);
      // Only phone accounts that have never set one land here — one with a
      // password already goes straight in, same as every other login.
      if (res.data.user?.password) {
        navigate("/");
      } else {
        setStep("password");
      }
    } catch (error) {
      if (error.response?.status === 428) {
        setNeedsRegistration(true);
        return;
      }
      setOtpError(error.response?.data?.message || "Invalid or expired code.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSavePassword = async () => {
    setPasswordError("");
    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    try {
      setIsSavingPassword(true);
      await API.post("/auth/set-password", { password: newPassword });
      navigate("/");
    } catch (error) {
      setPasswordError(error.response?.data?.message || "Unable to save password. Please try again.");
    } finally {
      setIsSavingPassword(false);
    }
  };

  const isCodeComplete = code.every((digit) => digit !== "");
  const formattedTime = `00:${String(timeLeft).padStart(2, "0")}`;

  return (
    <div className="h-screen w-full bg-[#EAEAEA] p-0 font-inter overflow-hidden flex items-center justify-center">
      <div className="flex w-full h-full items-stretch gap-4 flex-col lg:flex-row">

        {/* LEFT SECTION */}
        <div className="relative h-full w-full lg:w-[clamp(360px,33vw,540px)] shrink-0 overflow-hidden rounded-[18px] bg-white hidden lg:block">
          <img src="/Ellipse 2.png" alt="" className="absolute left-0 -top-40 z-10 h-auto w-full object-contain" />
          <img src="/Ellipse 1.png" alt="" className="absolute left-0 z-10 h-[120%] w-full object-contain" />
          <div className="absolute bottom-[32px] mb-20 left-1/2 z-20 h-[286px] w-[448px] -translate-x-1/2">
            <div className="absolute left-[178px] top-0 flex h-[92px] w-[92px] items-center justify-center rounded-[16px] bg-[#0085FF]">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M20 10C15.0294 10 11 14.0294 11 19V31.0498C11 31.5743 10.5743 32 10.0498 32C9.798 31.9999 9.557 31.8997 9.3789 31.7217L0 22.3428V26.585L7.2578 33.8428C7.9984 34.5834 9.002 34.9999 10.0498 35C12.2312 35 14 33.2312 14 31.0498V19C14 15.6863 16.6863 13 20 13C23.3137 13 26 15.6863 26 19V31.0498C26 33.2312 27.7688 35 29.9502 35C30.998 34.9999 32.0016 34.5834 32.7422 33.8428L34.707 31.8785L37.707 28.8785L40 26.585V22.3428L37.8789 24.4639L35.585 26.7574L32.585 29.7574L30.6211 31.7217C30.443 31.8997 30.202 31.9999 29.9502 32C29.4257 32 29 31.5743 29 31.0498V19C29 14.0294 24.9706 10 20 10ZM20 15C17.7909 15 16 16.7909 16 19V31.0498C16 34.3358 13.3358 37 10.0498 37C8.472 36.9999 6.958 36.3735 5.8428 35.2578L0 29.4141V33.6562L3.722 37.3789C5.400 39.0572 7.676 39.9999 10.0498 40C14.9926 40 19 35.9926 19 31.0498V19C19 18.4477 19.4477 18 20 18C20.5523 18 21 18.4477 21 19V31.0498C21 35.9926 25.0074 40 29.9502 40C32.324 39.9999 34.6 39.0572 36.278 37.3789L40 33.6562V29.4141L34.1572 35.2578C33.042 36.3734 31.528 36.9999 29.9502 37C26.6642 37 24 34.3358 24 31.0498V19C24 16.7909 22.2091 15 20 15Z"
                  fill="#F8FAFC"
                />
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
        <div className="min-h-0 w-full min-w-0 flex-1 overflow-hidden rounded-[18px] bg-white lg:h-full lg:min-h-0">
          <div className="flex min-h-0 w-full items-center justify-center overflow-visible px-[clamp(12px,4vw,40px)] py-[clamp(16px,3vh,32px)] lg:h-full lg:overflow-y-auto lg:overscroll-contain">
            <div className="w-full max-w-[449px] py-[clamp(4px,1vh,12px)]">

              <div className="w-full">
                <div className="h-[32px] w-[32px]">
                  <img
                    src="https://ik.imagekit.io/qiap0iq38/DATACIRCLES_PROJECT/signup/Logo.png"
                    alt="logo"
                    className="h-[32px] w-[32px] object-contain"
                  />
                </div>

                <h1 className="mt-[20px] font-['Inter'] text-[28px] font-semibold leading-[36px] tracking-[-0.14px] text-[#0F172A]">
                  {step === "phone" ? "Sign In With Phone" : step === "otp" ? "Enter Your Code" : "Set a Password"}
                </h1>

                {step === "phone" ? (
                  <p className="mt-[8px] font-['Inter'] text-[18px] font-medium leading-[28px] text-[#475569]">
                    We'll text a verification code to your phone number.
                  </p>
                ) : step === "otp" ? (
                  <p className="mt-[8px] font-['Inter'] text-[18px] font-medium leading-[28px] text-[#475569]">
                    Enter the 4-digit code we sent to <span className="text-[#0085FF]">{phone}</span>
                  </p>
                ) : (
                  <p className="mt-[8px] font-['Inter'] text-[18px] font-medium leading-[28px] text-[#475569]">
                    Add a password so you can sign in next time without waiting for a text — or skip and use your phone number again.
                  </p>
                )}
              </div>

              {needsRegistration ? (
                <div className="mt-[24px] w-full">
                  <p className="font-['Inter'] text-[14px] font-medium leading-[20px] text-[#475569]">
                    We don't have an account for this number yet. Please create an account with your email instead.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate("/register")}
                    className="mt-[16px] h-[48px] w-full rounded-full bg-[#0085FF] font-['Inter'] text-[14px] font-medium leading-[20px] text-white transition hover:bg-[#0078E8]"
                  >
                    Create Account
                  </button>
                </div>
              ) : step === "phone" ? (
                <div className="mt-[24px] w-full lg:max-w-[449px]">
                  <label className="block font-['Inter'] text-[14px] font-medium leading-[20px] text-[#0F172A]">
                    Phone Number <span className="text-[#DC2626]">*</span>
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setPhoneError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
                    placeholder="ex.9876543210"
                    className={`mt-[8px] h-[48px] w-full lg:max-w-[449px] rounded-full border bg-white px-[16px] font-['Inter'] text-[14px] font-normal leading-[20px] text-[#0F172A] outline-none placeholder:text-[#64748B] ${
                      phoneError ? "border-[#DC2626]" : "border-[#E2E8F0] focus:border-[#0085FF]"
                    }`}
                  />
                  {phoneError && (
                    <p className="mt-[6px] font-['Inter'] text-[13px] font-medium text-[#DC2626]">{phoneError}</p>
                  )}

                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={isSending}
                    className="mt-[24px] h-[48px] w-full rounded-full bg-[#0085FF] font-['Inter'] text-[14px] font-medium leading-[20px] text-white transition hover:bg-[#0078E8] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSending ? "Sending..." : "Send Code"}
                  </button>
                </div>
              ) : step === "otp" ? (
                <div className="mt-[24px] w-full">
                  <div className="flex w-full justify-between gap-[clamp(8px,2vw,16px)]" onPaste={handlePaste}>
                    {code.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => { inputRefs.current[index] = el; }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleCodeChange(e.target.value, index)}
                        onKeyDown={(e) => handleKeyDown(e, index)}
                        className="h-[clamp(48px,6.5vh,56px)] w-full max-w-[96px] min-w-0 flex-1 rounded-full border border-[#E2E8F0] bg-white text-center font-['Inter'] text-[16px] font-normal leading-[20px] text-[#0F172A] outline-none transition focus:border-[#0085FF]"
                      />
                    ))}
                  </div>

                  <div className="mt-[16px] flex w-full flex-wrap items-center justify-center gap-[8px] text-center">
                    <span className="font-['Inter'] text-[14px] font-semibold leading-[20px] text-[#0F172A]">
                      Didn't Receive It?
                    </span>
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={timeLeft > 0}
                      className={`font-['Inter'] text-[14px] font-semibold leading-[20px] ${
                        timeLeft > 0 ? "cursor-not-allowed text-[#94A3B8]" : "cursor-pointer text-[#0085FF]"
                      }`}
                    >
                      {timeLeft > 0 ? formattedTime : "Resend"}
                    </button>
                  </div>

                  {otpError && (
                    <p className="mt-3 text-center font-['Inter'] text-[13px] font-medium text-red-500">{otpError}</p>
                  )}

                  <button
                    type="button"
                    onClick={handleVerify}
                    disabled={!isCodeComplete || isVerifying}
                    className="mt-[clamp(16px,2.5vh,24px)] h-[clamp(42px,5.5vh,48px)] w-full rounded-full bg-[#0085FF] font-['Inter'] text-[14px] font-medium leading-[20px] text-white transition hover:bg-[#0078E8] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isVerifying ? "Verifying..." : "Verify & Sign In"}
                  </button>
                </div>
              ) : (
                <div className="mt-[24px] w-full lg:max-w-[449px]">
                  <label className="block font-['Inter'] text-[14px] font-medium leading-[20px] text-[#0F172A]">
                    New Password <span className="text-[#DC2626]">*</span>
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setPasswordError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && handleSavePassword()}
                    placeholder="ex.**********"
                    className={`mt-[8px] h-[48px] w-full lg:max-w-[449px] rounded-full border bg-white px-[16px] font-['Inter'] text-[14px] font-normal leading-[20px] text-[#0F172A] outline-none placeholder:text-[#64748B] ${
                      passwordError ? "border-[#DC2626]" : "border-[#E2E8F0] focus:border-[#0085FF]"
                    }`}
                  />
                  {passwordError && (
                    <p className="mt-[6px] font-['Inter'] text-[13px] font-medium text-[#DC2626]">{passwordError}</p>
                  )}

                  <button
                    type="button"
                    onClick={handleSavePassword}
                    disabled={isSavingPassword}
                    className="mt-[24px] h-[48px] w-full rounded-full bg-[#0085FF] font-['Inter'] text-[14px] font-medium leading-[20px] text-white transition hover:bg-[#0078E8] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSavingPassword ? "Saving..." : "Save & Continue"}
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate("/")}
                    className="mt-[16px] w-full cursor-pointer font-['Inter'] text-[14px] font-semibold leading-[20px] text-[#64748B] hover:underline"
                  >
                    Skip for now
                  </button>
                </div>
              )}

              {/* No back option once a password's already been set — you're signed in at
                  that point, there's nothing to go back to. */}
              {step !== "password" && (
                <div className="mt-[clamp(12px,2vh,18px)] flex w-full items-center justify-center">
                  <button
                    type="button"
                    onClick={() => (step === "otp" && !needsRegistration ? setStep("phone") : navigate("/login"))}
                    className="cursor-pointer font-['Inter'] text-[14px] font-semibold leading-[20px] text-[#64748B] hover:underline"
                  >
                    ← Go Back
                  </button>
                </div>
              )}

              <div className="mt-[clamp(24px,5vh,96px)] whitespace-nowrap w-full justify-center">
                <div className="h-px w-full bg-[#E2E8F0]" />
                <div className="mt-[clamp(12px,2vh,20px)] flex w-full items-center justify-center pb-4">
                  <span className="text-center font-['Inter'] text-[13px] font-normal leading-[20px] text-[#475569] sm:text-[14px]">
                    2026 Datacircles. All Rights Reserved.
                  </span>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
