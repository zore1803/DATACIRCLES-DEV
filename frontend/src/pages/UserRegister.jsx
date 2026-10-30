import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import API from "../services/api";

// Customization questions. `multi` questions take up to MAX_PICKS answers, from the chips and/or typed in.
const MAX_PICKS = 2;
const QUESTIONS = [
  {
    field: "usage",
    label: "What will you be using DataCircles for?",
    options: ["CRM", "Project Management", "Invoicing", "HR"],
    placeholder: "Type what you use it for, press Enter",
    multi: true,
  },
  {
    field: "mainGoal",
    label: "What is your main goal?",
    options: ["Increase Sales", "Organization", "Team Collab"],
    placeholder: "Type your goal, press Enter",
    multi: true,
  },
  {
    field: "teamSize",
    label: "How big is your team?",
    options: ["Just me", "2-10", "11-50", "50+"],
    multi: false,
  },
  {
    field: "source",
    label: "Where did you hear about us?",
    options: ["Google", "LinkedIn", "Friend"],
    placeholder: "Type where you heard about us, press Enter",
    multi: true,
  },
];

export default function Register() {
  const location = useLocation();
  const [accountCreated, setAccountCreated] = useState(
    location.state?.accountCreated === true
  );
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Form states
  const [fullName, setFullName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Signup states
  const [errors, setErrors] = useState({
    fullName: "",
    workEmail: "",
    password: "",
    confirmPassword: "",
    general: "",
  });

  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  // Signup is three steps and the account is only created at the very end:
  //   1 account details + email OTP  ->  2 customization questions  ->  3 company (skippable)
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState({ usage: [], mainGoal: [], teamSize: "", source: [] });
  const [company, setCompany] = useState({ workspaceName: "", workspaceAddress: "", workspaceState: "" });
  // "Others": an input appears, Enter adds the typed value as another selected chip.
  const [otherOpen, setOtherOpen] = useState({ usage: false, mainGoal: false, source: false });
  const [otherDraft, setOtherDraft] = useState({ usage: "", mainGoal: "", source: "" });

  const togglePick = (field, value) =>
    setAnswers((prev) => {
      const current = prev[field];
      if (current.includes(value)) return { ...prev, [field]: current.filter((v) => v !== value) };
      if (current.length >= MAX_PICKS) return prev;
      return { ...prev, [field]: [...current, value] };
    });

  const addCustomPick = (field) => {
    const value = otherDraft[field].trim().slice(0, 60);
    if (!value) return;
    setAnswers((prev) => {
      const current = prev[field];
      if (current.length >= MAX_PICKS || current.some((v) => v.toLowerCase() === value.toLowerCase())) return prev;
      return { ...prev, [field]: [...current, value] };
    });
    setOtherDraft((prev) => ({ ...prev, [field]: "" }));
  };

  const questionsAnswered =
    answers.usage.length > 0 && answers.mainGoal.length > 0 && !!answers.teamSize && answers.source.length > 0;

  // Email is verified with a one-time code BEFORE the account is created.
  // idle -> (code sent) sent -> (code accepted) verified
  const [emailStep, setEmailStep] = useState("idle");
  const [emailOtp, setEmailOtp] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const navigate = useNavigate();

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const setEmailError = (message) =>
    setErrors((prev) => ({ ...prev, workEmail: message, general: "" }));

  const handleSendEmailOtp = async () => {
    const email = workEmail.trim().toLowerCase();
    if (!email) return setEmailError("Work email is required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return setEmailError("Please enter a valid email address.");
    }
    try {
      setOtpBusy(true);
      setEmailError("");
      await API.post("/auth/signup/send-otp", { email });
      setEmailOtp("");
      setEmailStep("sent");
      setResendIn(30);
    } catch (error) {
      setEmailError(error.response?.data?.message || "Unable to send the code. Please try again.");
    } finally {
      setOtpBusy(false);
    }
  };

  const handleVerifyEmailOtp = async () => {
    if (emailOtp.length !== 6 || otpBusy) return;
    try {
      setOtpBusy(true);
      setEmailError("");
      await API.post("/auth/signup/verify-otp", {
        email: workEmail.trim().toLowerCase(),
        code: emailOtp,
      });
      setEmailStep("verified");
    } catch (error) {
      setEmailError(error.response?.data?.message || "Invalid verification code.");
    } finally {
      setOtpBusy(false);
    }
  };

  // Editing the address invalidates any code that was sent for the old one.
  const handleChangeEmail = () => {
    setEmailStep("idle");
    setEmailOtp("");
    setResendIn(0);
    setEmailError("");
  };

  // ==================================================
  // HANDLE SIGNUP
  // ==================================================

  const handleNext = () => {
    const newErrors = {
      fullName: "",
      workEmail: "",
      password: "",
      confirmPassword: "",
      general: "",
    };

    // --------------------------------------------------
    // FULL NAME
    // --------------------------------------------------

    if (!fullName.trim()) {
      newErrors.fullName = "Full name is required.";
    } else if (fullName.trim().length < 2) {
      newErrors.fullName = "Please enter a valid full name.";
    }

    // --------------------------------------------------
    // EMAIL
    // --------------------------------------------------

    if (!workEmail.trim()) {
      newErrors.workEmail = "Work email is required.";
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail.trim())
    ) {
      newErrors.workEmail = "Please enter a valid email address.";
    } else if (emailStep !== "verified") {
      newErrors.workEmail = "Please verify your email to continue.";
    }

    // --------------------------------------------------
    // PASSWORD
    // --------------------------------------------------

    if (!password) {
      newErrors.password = "Password is required.";
    } else if (password.length < 6) {
      newErrors.password =
        "Password must be at least 6 characters.";
    }

    // --------------------------------------------------
    // CONFIRM PASSWORD
    // --------------------------------------------------

    if (!confirmPassword) {
      newErrors.confirmPassword =
        "Please confirm your password.";
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword =
        "Passwords do not match.";
    }

    // --------------------------------------------------
    // STOP IF THERE ARE VALIDATION ERRORS
    // --------------------------------------------------

    if (
      newErrors.fullName ||
      newErrors.workEmail ||
      newErrors.password ||
      newErrors.confirmPassword
    ) {
      setErrors(newErrors);
      return;
    }

    // Nothing is sent yet — the account is created after the last step.
    setErrors(newErrors);
    setStep(2);
  };

  // Final step. `includeCompany` is false when the company step was skipped.
  const handleCreateAccount = async (includeCompany) => {
    try {
      setIsCreatingAccount(true);

      await API.post("/auth/register", {
        fullName: fullName.trim(),
        email: workEmail.trim().toLowerCase(),
        password,
        ...answers,
        ...(includeCompany
          ? {
              workspaceName: company.workspaceName.trim(),
              workspaceAddress: company.workspaceAddress.trim(),
              workspaceState: company.workspaceState.trim(),
            }
          : {}),
      });

      // --------------------------------------------------
      // SUCCESS
      // --------------------------------------------------

      setErrors({
        fullName: "",
        workEmail: "",
        password: "",
        confirmPassword: "",
        general: "",
      });

      // The email was verified before this call, so the account is ready to use.
      setAccountCreated(true);
    } catch (error) {
      console.error("Signup error:", error);

      // The email verification window (10 min) can lapse while the later steps are filled in.
      if (/verify your email/i.test(error.response?.data?.message || "")) {
        setEmailStep("idle");
        setEmailOtp("");
        setStep(1);
        setErrors({
          fullName: "",
          workEmail: error.response.data.message,
          password: "",
          confirmPassword: "",
          general: "",
        });
        return;
      }

      setErrors({
        fullName: "",
        workEmail: "",
        password: "",
        confirmPassword: "",
        general:
          error.response?.data?.message ||
          "Unable to create account. Please try again.",
      });
    } finally {
      setIsCreatingAccount(false);
    }
  };

  // ==================================================
  // RETURN
  // ==================================================

  return (
    <div className="h-screen w-full bg-[#EAEAEA] p-0 font-inter overflow-hidden flex items-center justify-center">
      <div className="flex w-full h-full items-stretch gap-4 flex-col lg:flex-row">

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
            ================================================== */}

        <div className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto rounded-[18px] bg-white lg:h-full lg:min-h-0">

          {/* CENTERED CONTENT */}
          <div className="flex h-full min-h-0 w-full items-center justify-center px-[clamp(12px,4vw,40px)] py-[clamp(16px,3vh,32px)]">

            <div
  className="m-auto h-auto w-full max-w-[480px]"
  style={{
    transform: "scale(0.92)",
    transformOrigin: "center center",
  }}
>

            {accountCreated ? (

              /* ==================================================
                 ACCOUNT CREATED SUCCESSFULLY
                 ================================================== */

              <div className="flex w-full flex-col items-center justify-center py-[clamp(2px,0.8vh,12px)] text-center">

                {/* Success Icon */}
                <div className="flex h-[clamp(48px,7vh,56px)] w-[clamp(48px,7vh,56px)] items-center justify-center rounded-full bg-[#F1F5F9]">

                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 28 28"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M23.3333 7L10.5 19.8333L4.66663 14"
                      stroke="#0085FF"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>

                </div>

                {/* Heading */}
                <h1
                  className="
                    mt-[clamp(12px,2.2vh,20px)]
                    font-['Inter']
                    text-[clamp(22px,3.2vh,28px)]
                    font-semibold
                    leading-[clamp(28px,4vh,36px)]
                    tracking-[-0.14px]
                    text-[#0F172A]
                  "
                >
                  Account Created Successfully
                </h1>

                {/* Description */}
                <p
                  className="
                    mt-[clamp(6px,1.2vh,8px)]
                    font-['Inter']
                    text-[clamp(15px,2.2vh,18px)]
                    font-medium
                    leading-[clamp(22px,3.2vh,28px)]
                    text-[#475569]
                  "
                >
                  Your account has been created successfully. You can now log in
                  to your account.
                </p>

                {/* Login Button */}
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="
                    mt-[clamp(20px,3.5vh,32px)]
                    h-[clamp(42px,5.5vh,48px)]
                    w-full
                    rounded-full
                    bg-[#0085FF]
                    font-['Inter']
                    text-[clamp(12px,1.4vw,14px)]
                    font-medium
                    leading-[20px]
                    text-white
                    transition
                    hover:bg-[#0078E8]
                  "
                >
                  Log In
                </button>

              </div>

            ) : (

              /* ==================================================
                 SIGNUP CONTENT
                 ================================================== */

              <div className="w-full py-[clamp(2px,0.8vh,12px)]">

                {/* TOP SECTION */}
                <div className="w-full">

                  {/* 44 × 44 Icon */}
                  <div className="h-[clamp(32px,4.5vh,44px)] w-[clamp(32px,4.5vh,44px)]">
  <img
    src="https://ik.imagekit.io/qiap0iq38/DATACIRCLES_PROJECT/signup/Logo.png"
    alt="logo"
    className="h-[clamp(32px,4.5vh,44px)] w-[clamp(32px,4.5vh,44px)] object-contain"
  />
</div>

                  {/* Heading */}
                  <h1
                    className="
                      mt-[clamp(12px,2.2vh,20px)]
                      font-['Inter']
                      text-[clamp(22px,3.2vh,28px)]
                      font-semibold
                      leading-[clamp(28px,4vh,36px)]
                      tracking-[-0.14px]
                      text-[#0F172A]
                    "
                  >
                    {step === 1 && "Create Your Account"}
                    {step === 2 && "Customize Your Workspace"}
                    {step === 3 && "Tell Us About Your Company"}
                  </h1>

                  {/* Description */}
                  <p
                    className="
                      mt-[clamp(6px,1.2vh,8px)]
                      font-['Inter']
                      text-[clamp(15px,2.2vh,18px)]
                      font-medium
                      leading-[clamp(22px,3.2vh,28px)]
                      tracking-[0]
                      text-[#475569]
                    "
                  >
                    {step === 1 &&
                      "Set up your workspace and start managing your business project workflows."}
                    {step === 2 && "A few quick questions so we can tailor DataCircles to you."}
                    {step === 3 &&
                      "Add your company details now, or skip and do it later from Settings."}
                  </p>

                  {/* Step indicator */}
                  <div className="mt-[clamp(10px,1.6vh,14px)] flex items-center gap-2">
                    {[1, 2, 3].map((n) => (
                      <span
                        key={n}
                        className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-[#0085FF]" : "bg-[#E2E8F0]"}`}
                      />
                    ))}
                    <span className="ml-1 whitespace-nowrap font-['Inter'] text-[12px] font-medium text-[#64748B]">
                      Step {step} of 3
                    </span>
                  </div>

                </div>

                {/* ==================================================
                    FORM SECTION
                    ================================================== */}

                {step === 1 && (
                <div className="mt-[clamp(16px,2.5vh,24px)] w-full">

                  {/* Full Name + Work Email */}
                  <div className="flex w-full flex-col gap-[clamp(14px,2.5vh,25px)]">

                    {/* FULL NAME */}
                    <div className="w-full">

                      <label
                        className="
                          block
                          font-['Inter']
                          text-[clamp(12px,1.4vw,14px)]
                          font-medium
                          leading-[20px]
                          text-[#0F172A]
                        "
                      >
                        Full Name{" "}
                        <span className="text-[#DC2626]">*</span>
                      </label>

                      <input
                        type="text"
                        placeholder="ex.John Doe"
                        value={fullName}
                        onChange={(e) => {
                          setFullName(e.target.value);

                          setErrors((prev) => ({
                            ...prev,
                            fullName: "",
                            general: "",
                          }));
                        }}
                        className={`
                          mt-[clamp(6px,1.2vh,8px)]
                          h-[clamp(42px,5.5vh,48px)]
                          w-full
                          rounded-full
                          border
                          bg-white
                          px-[clamp(12px,1.5vw,16px)]
                          font-['Inter']
                          text-[clamp(12px,1.4vw,14px)]
                          font-normal
                          leading-[20px]
                          text-[#0F172A]
                          outline-none
                          placeholder:text-[#64748B]
                          ${
                            errors.fullName
                              ? "border-[#DC2626]"
                              : "border-[#E2E8F0] focus:border-[#0085FF]"
                          }
                        `}
                      />

                      {errors.fullName && (
                        <p className="mt-[4px] text-[clamp(11px,0.9vw,12px)] font-medium leading-[clamp(15px,2vh,16px)] text-[#DC2626]">
                          {errors.fullName}
                        </p>
                      )}

                    </div>

                    {/* WORK EMAIL */}
                    <div className="w-full">

                      <div className="flex items-center justify-between">
                      <label
                        className="
                          block
                          font-['Inter']
                          text-[clamp(12px,1.4vw,14px)]
                          font-medium
                          leading-[20px]
                          text-[#0F172A]
                        "
                      >
                        {emailStep === "sent" ? "Verification code" : "Work email"}{" "}
                        <span className="text-[#DC2626]">*</span>
                      </label>
                      {emailStep === "verified" && (
                        <button
                          type="button"
                          onClick={handleChangeEmail}
                          className="font-['Inter'] text-[12px] font-medium text-[#475569] hover:text-[#0F172A]"
                        >
                          Change email
                        </button>
                      )}
                      </div>

                      <div className="mt-[clamp(6px,1.2vh,8px)] flex items-center gap-2">
                      <input
                        type={emailStep === "sent" ? "text" : "email"}
                        inputMode={emailStep === "sent" ? "numeric" : undefined}
                        autoComplete={emailStep === "sent" ? "one-time-code" : undefined}
                        maxLength={emailStep === "sent" ? 6 : undefined}
                        placeholder={emailStep === "sent" ? "Enter 6-digit code" : "ex.johndoe@example.com"}
                        value={emailStep === "sent" ? emailOtp : workEmail}
                        disabled={emailStep === "verified"}
                        onKeyDown={(e) => {
                          if (emailStep === "sent" && e.key === "Enter") {
                            e.preventDefault();
                            handleVerifyEmailOtp();
                          }
                        }}
                        onChange={(e) => {
                          if (emailStep === "sent") {
                            setEmailOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
                          } else {
                            setWorkEmail(e.target.value);
                          }

                          setErrors((prev) => ({
                            ...prev,
                            workEmail: "",
                            general: "",
                          }));
                        }}
                        className={`
                          h-[clamp(42px,5.5vh,48px)]
                          min-w-0
                          flex-1
                          rounded-full
                          border
                          bg-white
                          px-[clamp(12px,1.5vw,16px)]
                          disabled:bg-[#F8FAFC]
                          disabled:text-[#475569]
                          font-['Inter']
                          text-[clamp(12px,1.4vw,14px)]
                          font-normal
                          leading-[20px]
                          text-[#0F172A]
                          outline-none
                          placeholder:text-[#64748B]
                          ${emailStep === "sent" ? "tracking-[0.25em] placeholder:tracking-normal" : ""}
                          ${
                            errors.workEmail
                              ? "border-[#DC2626]"
                              : "border-[#E2E8F0] focus:border-[#0085FF]"
                          }
                        `}
                      />

                      {emailStep === "idle" && (
                        <button
                          type="button"
                          onClick={handleSendEmailOtp}
                          disabled={otpBusy || !workEmail.trim()}
                          className="h-[clamp(42px,5.5vh,48px)] shrink-0 rounded-full bg-[#0085FF] px-4 font-['Inter'] text-[13px] font-medium text-white transition hover:bg-[#0078E8] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {otpBusy ? "Sending..." : "Verify"}
                        </button>
                      )}
                      {emailStep === "sent" && (
                        <button
                          type="button"
                          onClick={handleVerifyEmailOtp}
                          disabled={otpBusy || emailOtp.length !== 6}
                          className="h-[clamp(42px,5.5vh,48px)] shrink-0 rounded-full bg-[#0085FF] px-4 font-['Inter'] text-[13px] font-medium text-white transition hover:bg-[#0078E8] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {otpBusy ? "Checking..." : "Verify"}
                        </button>
                      )}
                      {emailStep === "verified" && (
                        <span className="flex h-[clamp(42px,5.5vh,48px)] shrink-0 items-center gap-1 px-1 text-[13px] font-medium text-[#16A34A]">
                          <svg width="14" height="14" viewBox="0 0 28 28" fill="none">
                            <path d="M23.3333 7L10.5 19.8333L4.66663 14" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Verified
                        </span>
                      )}
                      </div>

                      {emailStep === "sent" && (
                        <div className="mt-1.5 flex flex-col gap-1 font-['Inter'] text-[12px]">
                          {emailStep === "sent" && (
                            <span className="text-[#64748B]">
                              Code sent to{" "}
                              <span className="font-medium text-[#0F172A]">{workEmail.trim().toLowerCase()}</span>
                            </span>
                          )}
                          <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={handleChangeEmail}
                            className="font-medium text-[#475569] hover:text-[#0F172A]"
                          >
                            Change email
                          </button>
                          {emailStep === "sent" && (
                            <button
                              type="button"
                              onClick={handleSendEmailOtp}
                              disabled={otpBusy || resendIn > 0}
                              className="font-medium text-[#0085FF] hover:underline disabled:cursor-not-allowed disabled:text-[#94A3B8] disabled:no-underline"
                            >
                              {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
                            </button>
                          )}
                          </div>
                        </div>
                      )}

                      {errors.workEmail && (
                        <p className="mt-[4px] text-[clamp(11px,0.9vw,12px)] font-medium leading-[clamp(15px,2vh,16px)] text-[#DC2626]">
                          {errors.workEmail}
                        </p>
                      )}

                    </div>

                  </div>

                  {/* ==================================================
                      PASSWORD
                      ================================================== */}

                  <div className="mt-[clamp(16px,2.8vh,25px)] w-full">

                    <label
                      className="
                        block
                        font-['Inter']
                        text-[clamp(12px,1.4vw,14px)]
                        font-medium
                        leading-[20px]
                        text-[#0F172A]
                      "
                    >
                      Password{" "}
                      <span className="text-[#DC2626]">*</span>
                    </label>

                    <div className="relative mt-[clamp(6px,1.2vh,8px)]">

                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="ex.**********"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);

                          setErrors((prev) => ({
                            ...prev,
                            password: "",
                            confirmPassword: "",
                            general: "",
                          }));
                        }}
                        className={`
                          h-[clamp(42px,5.5vh,48px)]
                          w-full
                          rounded-full
                          border
                          bg-white
                          px-[clamp(12px,1.5vw,16px)]
                          pr-[clamp(38px,3vw,45px)]
                          font-['Inter']
                          text-[clamp(12px,1.4vw,14px)]
                          font-normal
                          leading-[20px]
                          text-[#0F172A]
                          outline-none
                          placeholder:text-[#64748B]
                          ${
                            errors.password
                              ? "border-[#DC2626]"
                              : "border-[#E2E8F0] focus:border-[#0085FF]"
                          }
                        `}
                      />

                      {/* Eye */}
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

                    {errors.password && (
                      <p className="mt-[4px] text-[clamp(11px,0.9vw,12px)] font-medium leading-[clamp(15px,2vh,16px)] text-[#DC2626]">
                        {errors.password}
                      </p>
                    )}

                  </div>

                  {/* ==================================================
                      CONFIRM PASSWORD
                      ================================================== */}

                  <div className="mt-[clamp(16px,2.8vh,25px)] w-full">

                    <label
                      className="
                        block
                        font-['Inter']
                        text-[clamp(12px,1.4vw,14px)]
                        font-medium
                        leading-[20px]
                        text-[#0F172A]
                      "
                    >
                      Confirm Password{" "}
                      <span className="text-[#DC2626]">*</span>
                    </label>

                    <div className="relative mt-[clamp(6px,1.2vh,8px)]">

                      <input
                        type={
                          showConfirmPassword
                            ? "text"
                            : "password"
                        }
                        placeholder="ex.**********"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);

                          setErrors((prev) => ({
                            ...prev,
                            confirmPassword: "",
                            general: "",
                          }));
                        }}
                        className={`
                          h-[clamp(42px,5.5vh,48px)]
                          w-full
                          rounded-full
                          border
                          bg-white
                          px-[clamp(12px,1.5vw,16px)]
                          pr-[clamp(38px,3vw,45px)]
                          font-['Inter']
                          text-[clamp(12px,1.4vw,14px)]
                          font-normal
                          leading-[20px]
                          text-[#0F172A]
                          outline-none
                          placeholder:text-[#64748B]
                          ${
                            errors.confirmPassword
                              ? "border-[#DC2626]"
                              : "border-[#E2E8F0] focus:border-[#0085FF]"
                          }
                        `}
                      />

                      {/* Eye */}
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

                    {errors.confirmPassword && (
                      <p className="mt-[4px] text-[clamp(11px,0.9vw,12px)] font-medium leading-[clamp(15px,2vh,16px)] text-[#DC2626]">
                        {errors.confirmPassword}
                      </p>
                    )}

                  </div>

                  {/* ==================================================
                      GENERAL SIGNUP ERROR
                      ================================================== */}

                  {errors.general && (
                    <div className="mt-[clamp(8px,1.5vh,12px)] flex items-center gap-[8px]">

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
                          text-[clamp(12px,1.3vw,13px)]
                          font-medium
                          leading-[20px]
                          text-[#DC2626]
                        "
                      >
                        {errors.general}
                      </span>

                    </div>
                  )}

                  {/* ==================================================
                      CREATE ACCOUNT BUTTON
                      ================================================== */}

                  <button
                    type="button"
                    onClick={handleNext}
                    className="
                      mt-[clamp(20px,3.5vh,32px)]
                      h-[clamp(42px,5.5vh,48px)]
                      w-full
                      rounded-full
                      bg-[#0085FF]
                      font-['Inter']
                      text-[clamp(12px,1.4vw,14px)]
                      font-medium
                      leading-[20px]
                      text-white
                      transition
                      hover:bg-[#0078E8]
                      disabled:cursor-not-allowed
                      disabled:opacity-70
                    "
                  >
                    Next
                  </button>

                </div>
                )}

                {step === 2 && (
                  <div className="mt-[clamp(16px,2.5vh,24px)] w-full">
                    {QUESTIONS.map((q) => {
                      const picked = q.multi ? answers[q.field] : [];
                      const custom = picked.filter((v) => !q.options.includes(v));
                      const full = q.multi && picked.length >= MAX_PICKS;
                      return (
                        <div key={q.field} className="mt-[clamp(14px,2.2vh,20px)] first:mt-0">
                          <p className="font-['Inter'] text-[clamp(12px,1.4vw,14px)] font-medium text-[#0F172A]">
                            {q.label} <span className="text-[#DC2626]">*</span>
                            {q.multi && (
                              <span className="ml-2 text-[12px] font-normal text-[#64748B]">Pick up to {MAX_PICKS}</span>
                            )}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {q.options.map((opt) => {
                              const on = q.multi ? picked.includes(opt) : answers[q.field] === opt;
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  disabled={q.multi && full && !on}
                                  onClick={() =>
                                    q.multi
                                      ? togglePick(q.field, opt)
                                      : setAnswers((prev) => ({ ...prev, [q.field]: opt }))
                                  }
                                  className={`rounded-full border px-4 py-2 font-['Inter'] text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${on ? "border-[#0085FF] bg-[#EAF4FF] text-[#0085FF]" : "border-[#E2E8F0] bg-white text-[#475569] hover:border-[#CBD5E1]"}`}
                                >
                                  {opt}
                                </button>
                              );
                            })}
                            {custom.map((value) => (
                              <button
                                key={value}
                                type="button"
                                title="Remove"
                                onClick={() => togglePick(q.field, value)}
                                className={`rounded-full border px-4 py-2 font-['Inter'] text-[13px] font-medium transition flex items-center gap-1.5 border-[#0085FF] bg-[#EAF4FF] text-[#0085FF]`}
                              >
                                {value}
                                <span aria-hidden="true" className="text-[15px] leading-none">&times;</span>
                              </button>
                            ))}
                            {q.multi && (
                              <button
                                type="button"
                                disabled={full}
                                onClick={() => setOtherOpen((prev) => ({ ...prev, [q.field]: !prev[q.field] }))}
                                className={`rounded-full border px-4 py-2 font-['Inter'] text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${otherOpen[q.field] && !full ? "border-[#0085FF] bg-[#EAF4FF] text-[#0085FF]" : "border-[#E2E8F0] bg-white text-[#475569] hover:border-[#CBD5E1]"}`}
                              >
                                Others
                              </button>
                            )}
                          </div>
                          {q.multi && otherOpen[q.field] && !full && (
                            <input
                              type="text"
                              autoFocus
                              maxLength={60}
                              placeholder={q.placeholder}
                              value={otherDraft[q.field]}
                              onChange={(e) => setOtherDraft((prev) => ({ ...prev, [q.field]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  addCustomPick(q.field);
                                }
                              }}
                              className="mt-2 h-[clamp(40px,5.2vh,46px)] w-full rounded-full border border-[#E2E8F0] bg-white px-[clamp(12px,1.5vw,16px)] font-['Inter'] text-[clamp(12px,1.4vw,14px)] text-[#0F172A] outline-none placeholder:text-[#64748B] focus:border-[#0085FF]"
                            />
                          )}
                        </div>
                      );
                    })}
                    <div className="mt-[clamp(20px,3.5vh,32px)] flex gap-3">
                      <button type="button" onClick={() => setStep(1)} className="h-[clamp(42px,5.5vh,48px)] rounded-full border border-[#E2E8F0] bg-white px-6 font-['Inter'] text-[clamp(12px,1.4vw,14px)] font-medium leading-[20px] text-[#475569] transition hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60">
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => setStep(3)}
                        disabled={!questionsAnswered}
                        className="h-[clamp(42px,5.5vh,48px)] flex-1 rounded-full bg-[#0085FF] font-['Inter'] text-[clamp(12px,1.4vw,14px)] font-medium leading-[20px] text-white transition hover:bg-[#0078E8] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="mt-[clamp(16px,2.5vh,24px)] w-full">
                    <div>
                      <label className="block font-['Inter'] text-[clamp(12px,1.4vw,14px)] font-medium leading-[20px] text-[#0F172A]">Company name</label>
                      <input
                        type="text"
                        placeholder="ex.Acme Pvt Ltd"
                        value={company.workspaceName}
                        onChange={(e) => setCompany((prev) => ({ ...prev, workspaceName: e.target.value }))}
                        className="mt-[clamp(6px,1.2vh,8px)] h-[clamp(42px,5.5vh,48px)] w-full rounded-full border border-[#E2E8F0] bg-white px-[clamp(12px,1.5vw,16px)] font-['Inter'] text-[clamp(12px,1.4vw,14px)] font-normal leading-[20px] text-[#0F172A] outline-none placeholder:text-[#64748B] focus:border-[#0085FF]"
                      />
                    </div>
                    <div className="mt-[clamp(14px,2.2vh,20px)]">
                      <label className="block font-['Inter'] text-[clamp(12px,1.4vw,14px)] font-medium leading-[20px] text-[#0F172A]">Address</label>
                      <input
                        type="text"
                        placeholder="ex.12, MG Road, Mumbai"
                        value={company.workspaceAddress}
                        onChange={(e) => setCompany((prev) => ({ ...prev, workspaceAddress: e.target.value }))}
                        className="mt-[clamp(6px,1.2vh,8px)] h-[clamp(42px,5.5vh,48px)] w-full rounded-full border border-[#E2E8F0] bg-white px-[clamp(12px,1.5vw,16px)] font-['Inter'] text-[clamp(12px,1.4vw,14px)] font-normal leading-[20px] text-[#0F172A] outline-none placeholder:text-[#64748B] focus:border-[#0085FF]"
                      />
                    </div>
                    <div className="mt-[clamp(14px,2.2vh,20px)]">
                      <label className="block font-['Inter'] text-[clamp(12px,1.4vw,14px)] font-medium leading-[20px] text-[#0F172A]">State</label>
                      <input
                        type="text"
                        placeholder="ex.Maharashtra"
                        value={company.workspaceState}
                        onChange={(e) => setCompany((prev) => ({ ...prev, workspaceState: e.target.value }))}
                        className="mt-[clamp(6px,1.2vh,8px)] h-[clamp(42px,5.5vh,48px)] w-full rounded-full border border-[#E2E8F0] bg-white px-[clamp(12px,1.5vw,16px)] font-['Inter'] text-[clamp(12px,1.4vw,14px)] font-normal leading-[20px] text-[#0F172A] outline-none placeholder:text-[#64748B] focus:border-[#0085FF]"
                      />
                    </div>

                    {errors.general && (
                      <p className="mt-3 text-[clamp(11px,0.9vw,12px)] font-medium text-[#DC2626]">
                        {errors.general}
                      </p>
                    )}

                    <div className="mt-[clamp(20px,3.5vh,32px)] flex gap-3">
                      <button
                        type="button"
                        onClick={() => setStep(2)}
                        disabled={isCreatingAccount}
                        className="h-[clamp(42px,5.5vh,48px)] rounded-full border border-[#E2E8F0] bg-white px-6 font-['Inter'] text-[clamp(12px,1.4vw,14px)] font-medium leading-[20px] text-[#475569] transition hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCreateAccount(false)}
                        disabled={isCreatingAccount}
                        className="h-[clamp(42px,5.5vh,48px)] rounded-full border border-[#E2E8F0] bg-white px-6 font-['Inter'] text-[clamp(12px,1.4vw,14px)] font-medium leading-[20px] text-[#475569] transition hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Skip
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCreateAccount(true)}
                        disabled={isCreatingAccount || !company.workspaceName.trim()}
                        className="h-[clamp(42px,5.5vh,48px)] flex-1 rounded-full bg-[#0085FF] font-['Inter'] text-[clamp(12px,1.4vw,14px)] font-medium leading-[20px] text-white transition hover:bg-[#0078E8] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isCreatingAccount ? "Creating Account..." : "Create Account"}
                      </button>
                    </div>
                  </div>
                )}

                {/* ==================================================
                    SOCIAL + LOGIN SECTION
                    ================================================== */}

                <div className="mt-[clamp(16px,2.5vh,24px)] w-full">

                  {step === 1 && (
                  <>
                  {/* Or Continue With */}
                  <div className="flex w-full items-center">

                    <div className="h-px flex-1 bg-[#E2E8F0]" />

                    <span
                      className="
                        mx-[clamp(8px,1.5vw,16px)]
                        whitespace-nowrap
                        font-['Inter']
                        text-[clamp(12px,1.4vw,14px)]
                        font-normal
                        leading-[20px]
                        text-[#64748B]
                      "
                    >
                      or continue with
                    </span>

                    <div className="h-px flex-1 bg-[#E2E8F0]" />

                  </div>

                  {/* Social Icons */}
                  <div className="mt-[clamp(10px,1.8vh,16px)] flex h-[clamp(36px,5vh,42px)] items-center justify-center gap-[clamp(4px,0.6vw,6px)]">

                    {/* Google */}
                    <button
                      type="button"
                      className="flex h-[clamp(36px,5vh,42px)] w-[clamp(36px,5vh,42px)] items-center justify-center"
                    >
                      <img
                        src="https://ik.imagekit.io/qiap0iq38/DATACIRCLES_PROJECT/signup/Rectangle%2034624569.png"
                        alt="Google"
                        className="h-[clamp(36px,5vh,42px)] w-[clamp(36px,5vh,42px)]"
                      />
                    </button>

                    {/* Phone */}
                    <button
                      type="button"
                      onClick={() => navigate("/phone-login")}
                      className="flex h-[clamp(36px,5vh,42px)] w-[clamp(36px,5vh,42px)] items-center justify-center"
                    >
                      <img
                        src="https://ik.imagekit.io/qiap0iq38/DATACIRCLES_PROJECT/signup/Rectangle%2034624568.png"
                        alt="Phone"
                        className="h-[clamp(36px,5vh,42px)] w-[clamp(36px,5vh,42px)]"
                      />
                    </button>

                  </div>

                  {/* Login Text */}
                  <div className="mt-[clamp(10px,2vh,17px)] flex justify-center">

                    <p
                      className="
                        text-center
                        font-['Inter']
                        text-[clamp(12px,1.4vw,14px)]
                        font-normal
                        leading-[20px]
                        text-[#0F172A]
                      "
                    >
                      Already have an account?{" "}

                      <button
                        type="button"
                        onClick={() => navigate("/login")}
                        className="
                          ml-[3px]
                          cursor-pointer
                          font-['Inter']
                          text-[clamp(12px,1.4vw,14px)]
                          font-semibold
                          leading-[20px]
                          text-[#0085FF]
                        "
                      >
                        Log In
                      </button>

                    </p>

                  </div>
                  </>
                  )}

                  {/* FOOTER */}
                  <div className="mt-[clamp(18px,4vh,56px)] whitespace-nowrap w-full justify-center">

                    {/* DIVIDER */}
                    <div className="h-px w-full bg-[#E2E8F0]" />

                    {/* Footer Content */}
                    <div className="mt-[clamp(10px,2vh,20px)] flex w-full flex-nowrap items-center justify-center gap-x-3 sm:gap-x-6 lg:gap-x-8 pb-2 whitespace-nowrap">

                      <span className="text-center font-['Inter'] text-[10px] sm:text-[12px] lg:text-[14px] font-normal leading-[20px] text-[#475569]">
                        2026 Datacircles. All Rights Reserved.
                      </span>

                      <div className="flex items-center gap-[12px] sm:gap-[20px] lg:gap-[32px]">

                        <button
                          type="button"
                          className="font-['Inter'] text-[10px] sm:text-[12px] lg:text-[14px] font-normal leading-[20px] text-[#475569]"
                        >
                          Privacy Policy
                        </button>

                        <button
                          type="button"
                          className="font-['Inter'] text-[10px] sm:text-[12px] lg:text-[14px] font-normal leading-[20px] text-[#475569]"
                        >
                          Terms of Service
                        </button>

                      </div>

                    </div>

                  </div>

                </div>

              </div>

            )}

            </div>

          </div>

        </div>

      </div>
    </div>
  );
}