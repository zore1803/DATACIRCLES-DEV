import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import API from "../services/api";

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

  const navigate = useNavigate();

  // ==================================================
  // HANDLE SIGNUP
  // ==================================================

  const handleSignup = async () => {
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

    // ==================================================
    // SEND DATA TO BACKEND
    // ==================================================

    try {
      setIsCreatingAccount(true);

      const { data } = await API.post("/auth/register", {
        fullName: fullName.trim(),
        email: workEmail.trim().toLowerCase(),
        password,
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

      // Registration is completed only after OTP verification.
      navigate("/verification", {
        state: {
          email:
            data.user?.email ||
            workEmail.trim().toLowerCase(),
        },
      });
    } catch (error) {
      console.error("Signup error:", error);

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

        <div className="relative h-full w-full lg:w-[clamp(360px,33vw,540px)] shrink-0 overflow-hidden rounded-[18px] bg-[#EAEAEA] hidden lg:block">

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
                    Create Your Account
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
                    Set up your workspace and start managing your business project
                    workflows.
                  </p>

                </div>

                {/* ==================================================
                    FORM SECTION
                    ================================================== */}

                <div className="mt-[clamp(16px,2.5vh,24px)] w-full">

                  {/* Full Name + Work Email */}
                  <div className="flex w-full flex-col gap-[clamp(14px,2.5vh,25px)] sm:flex-row">

                    {/* FULL NAME */}
                    <div className="w-full sm:w-[calc(50%-8px)]">

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
                    <div className="w-full sm:w-[calc(50%-8px)]">

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
                        Work email{" "}
                        <span className="text-[#DC2626]">*</span>
                      </label>

                      <input
                        type="email"
                        placeholder="ex.johndoe@example.com"
                        value={workEmail}
                        onChange={(e) => {
                          setWorkEmail(e.target.value);

                          setErrors((prev) => ({
                            ...prev,
                            workEmail: "",
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
                            errors.workEmail
                              ? "border-[#DC2626]"
                              : "border-[#E2E8F0] focus:border-[#0085FF]"
                          }
                        `}
                      />

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
                    onClick={handleSignup}
                    disabled={isCreatingAccount}
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
                    {isCreatingAccount
                      ? "Creating Account..."
                      : "Create Account"}
                  </button>

                </div>

                {/* ==================================================
                    SOCIAL + LOGIN SECTION
                    ================================================== */}

                <div className="mt-[clamp(16px,2.5vh,24px)] w-full">

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