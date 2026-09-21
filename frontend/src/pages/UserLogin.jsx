
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import API from "../services/api";

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [isError, setIsError] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();

   // ==================================================
  // AUTH0
  // ==================================================

  const { loginWithRedirect } = useAuth0();

  const AUTH0_GOOGLE_CONNECTION =
    import.meta.env.VITE_AUTH0_GOOGLE_CONNECTION || "google-oauth2";
  const AUTH0_REDIRECT_URI =
    import.meta.env.VITE_AUTH0_REDIRECT_URI || window.location.origin;
  const AUTH0_AUDIENCE = import.meta.env.VITE_AUTH0_AUDIENCE;

  // ==================================================
  // GOOGLE LOGIN
  // ==================================================

  const handleGoogleLogin = async () => {
    try {
      await loginWithRedirect({
        authorizationParams: {
          connection: AUTH0_GOOGLE_CONNECTION,
          redirect_uri: AUTH0_REDIRECT_URI,
          ...(AUTH0_AUDIENCE && { audience: AUTH0_AUDIENCE }),
        },
      });
    } catch (error) {
      console.error("Google login error:", error);
    }
  };
  // ==================================================
  // HANDLE LOGIN
  // ==================================================

  const handleLogin = async () => {
    setIsError(false);

    // Check empty fields
    if (!email.trim() || !password) {
      setIsError(true);
      return;
    }

    // Check email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setIsError(true);
      return;
    }

    try {
      const res = await API.post("/auth/login", {
        email: email.trim().toLowerCase(),
        password,
      });

      // User is already verified, so go directly to dashboard (the "/" route, not "/dashboard" —
      // there is no route by that name).
      localStorage.setItem("token", res.data.token);
      navigate("/");
    } catch (error) {
      setIsError(true);

      // Only send unverified users to OTP verification.
      if (error.response?.data?.requiresVerification) {
        navigate("/verification", {
          state: {
            email: email.trim().toLowerCase(),
          },
        });
        return;
      }

      console.error("Login error:", error);
    }
  };

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
                  d="M20 10C15.0294 10 11 14.0294 11 19V31.0498C11 31.5743 10.5743 32 10.0498 32C9.798 31.9999 9.557 31.8997 9.3789 31.7217L0 22.3428V26.585L7.2578 33.8428C7.9984 34.5834 9.002 34.9999 10.0498 35C12.2312 35 14 33.2312 14 31.0498V19C14 15.6863 16.6863 13 20 13C23.3137 13 26 15.6863 26 19V31.0498C26 33.2312 27.7688 35 29.9502 35C30.998 35 32.0016 34.5834 32.7422 33.8428L34.707 31.8785L37.707 28.8785L40 26.585V22.3428L37.8789 24.4639L35.585 26.7574L32.585 29.7574L30.6211 31.7217C30.443 31.8999 30.202 32 29.9502 32C29.4257 32 29 31.5743 29 31.0498V19C29 14.0294 24.9706 10 20 10ZM20 15C17.7909 15 16 16.7909 16 19V31.0498C16 34.3358 13.3358 37 10.0498 37C8.472 36.9999 6.958 36.3735 5.8428 35.2578L0 29.4141V33.6562L3.722 37.3789C5.400 39.0572 7.676 39.9999 10.0498 40C14.9926 40 19 35.9926 19 31.0498V19C19 18.4477 19.4477 18 20 18C20.5523 18 21 18.4477 21 19V31.0498C21 35.9926 25.0074 40 29.9502 40C32.324 40 34.6 39.0572 36.278 37.3789L40 33.6562V29.4141L34.1572 35.2578C33.042 36.3734 31.528 36.9999 29.9502 37C26.6642 37 24 34.3358 24 31.0498V19C24 16.7909 22.2091 15 20 15Z"
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

        <div className="h-full min-w-0 w-full flex-1 overflow-y-auto rounded-[18px] bg-white">

          {/* CENTERED CONTENT */}
          <div className="flex min-h-full w-full items-center justify-center px-4 sm:px-6 lg:px-0 py-4 lg:py-0">

            <div
              className="m-auto h-auto w-full max-w-[480px]"
              style={{
                transform: "scale(0.92)",
                transformOrigin: "center center",
              }}
            >

              {/* ==================================================
                  TOP SECTION
                  ================================================== */}

              <div className="w-full lg:max-w-[449px]">

                {/* LOGO */}
                <div className="h-[32px] w-[32px]">

                  <img
                    src="https://ik.imagekit.io/qiap0iq38/DATACIRCLES_PROJECT/signup/Logo.png"
                    alt="logo"
                    className="h-[32px] w-[32px] object-contain"
                  />

                </div>

                {/* HEADING */}
                <h1
                  className="
                    mt-[20px]
                    font-['Inter']
                    text-[28px]
                    font-semibold
                    leading-[36px]
                    tracking-[-0.14px]
                    text-[#0F172A]
                  "
                >
                  Welcome Back
                </h1>

                {/* DESCRIPTION */}
                <p
                  className="
                    mt-[8px]
                    font-['Inter']
                    text-[18px]
                    font-medium
                    leading-[28px]
                    text-[#475569]
                  "
                >
                  Sign in to your account to continue managing your
                  business workflows.
                </p>

              </div>

              {/* ==================================================
                  FORM
                  ================================================== */}

              <div className="mt-[24px] w-full lg:max-w-[449px]">

                {/* EMAIL */}
                <div className="w-full lg:max-w-[449px]">

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
                    Work email{" "}
                    <span className="text-[#DC2626]">*</span>
                  </label>

                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setIsError(false);
                    }}
                    placeholder="ex.johndoe@example.com"
                    className={`
                      mt-[8px]
                      h-[48px]
                      w-full
                      lg:max-w-[449px]
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
                        isError
                          ? "border-[#DC2626]"
                          : "border-[#E2E8F0] focus:border-[#0085FF]"
                      }
                    `}
                  />

                </div>

                {/* PASSWORD */}
                <div className="mt-[25px] w-full lg:max-w-[449px]">

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
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setIsError(false);
                      }}
                      placeholder="ex.**********"
                      className={`
                        h-[48px]
                        w-full
                        lg:max-w-[449px]
                        rounded-full
                        border
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
                        ${
                          isError
                            ? "border-[#DC2626]"
                            : "border-[#E2E8F0] focus:border-[#0085FF]"
                        }
                      `}
                    />

                    {/* EYE BUTTON */}
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
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

                </div>

                {/* FORGOT PASSWORD */}
                <div className="mt-[12px] flex justify-end">

                  <button
                    type="button"
                    onClick={() => navigate("/forgot-password")}
                    className="
                      font-['Inter']
                      cursor-pointer
                      text-[14px]
                      font-medium
                      leading-[20px]
                      text-[#0085FF]
                    "
                  >
                    Forgot Password?
                  </button>

                </div>

                {/* ERROR MESSAGE */}
                {isError && (
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
                      Please enter a valid email and password.
                    </span>

                  </div>
                )}

                {/* SIGN IN BUTTON */}
                <button
                  type="button"
                  onClick={handleLogin}
                  className="
                    mt-[24px]
                    h-[48px]
                    w-full
                    lg:max-w-[449px]
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
                  Sign In
                </button>

              </div>

              {/* ==================================================
                  SOCIAL LOGIN
                  ================================================== */}

              <div className="mt-[24px] w-full lg:max-w-[449px]">

                {/* OR CONTINUE */}
                <div className="flex w-full items-center">

                  <div className="h-px flex-1 bg-[#E2E8F0]" />

                  <span
                    className="
                      mx-[16px]
                      whitespace-nowrap
                      font-['Inter']
                      text-[14px]
                      font-normal
                      leading-[20px]
                      text-[#64748B]
                    "
                  >
                    or continue with
                  </span>

                  <div className="h-px flex-1 bg-[#E2E8F0]" />

                </div>

                {/* SOCIAL ICONS */}
                <div className="mt-[16px] flex h-[42px] items-center justify-center gap-[6px]">

                  {/* GOOGLE */}
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    className="
                      flex
                      h-[42px]
                      w-[42px]
                      items-center
                      justify-center
                      cursor-pointer
                    "
                  >
                    <img
                      src="https://ik.imagekit.io/qiap0iq38/DATACIRCLES_PROJECT/signup/Rectangle%2034624569.png"
                      alt="Google"
                      className="h-[42px] w-[42px]"
                    />
                  </button>

                  {/* PHONE */}
                  <button
                    type="button"
                    onClick={() => navigate("/phone-login")}
                    className="
                      flex
                      h-[42px]
                      w-[42px]
                      items-center
                      justify-center
                    "
                  >
                    <img
                      src="https://ik.imagekit.io/qiap0iq38/DATACIRCLES_PROJECT/signup/Rectangle%2034624568.png"
                      alt="Phone"
                      className="h-[42px] w-[42px]"
                    />
                  </button>

                </div>

                {/* REGISTER */}
                <div className="mt-[17px] flex justify-center">

                  <p
                    className="
                      font-['Inter']
                      text-[14px]
                      font-normal
                      leading-[20px]
                      text-[#0F172A]
                    "
                  >
                    Don't have an account?{" "}

                    <button
                      type="button"
                      onClick={() => navigate("/register")}
                      className="
                        ml-[3px]
                        cursor-pointer
                        font-['Inter']
                        text-[14px]
                        font-semibold
                        leading-[20px]
                        text-[#0085FF]
                      "
                    >
                      Get Started
                    </button>

                  </p>

                </div>

                {/* FOOTER */}
                <div className="mt-8 lg:mt-12 justify-center w-full lg:max-w-[448px]">

                  {/* DIVIDER */}
                  <div className="h-px w-full lg:w-[120%] lg:-translate-x-10 bg-[#E2E8F0]" />

                  {/* FOOTER CONTENT */}
                  <div className="mt-[20px] flex w-full flex-nowrap items-center justify-center gap-x-3 sm:gap-x-6 lg:gap-x-8 whitespace-nowrap">

                    <span
                      className="
                        font-['Inter']
                        text-[10px]
                        sm:text-[12px]
                        lg:text-[14px]
                        font-normal
                        leading-[20px]
                        text-[#475569]
                      "
                    >
                      2026 Datacircles. All Rights Reserved.
                    </span>

                    <div className="flex items-center gap-[12px] sm:gap-[20px] lg:gap-[32px]">

                      <button
                        type="button"
                        className="
                          font-['Inter']
                          text-[10px]
                          sm:text-[12px]
                          lg:text-[14px]
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
                          text-[10px]
                          sm:text-[12px]
                          lg:text-[14px]
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

              </div>

            </div>

          </div>

        </div>

      </div>
    </div>
  );
}

