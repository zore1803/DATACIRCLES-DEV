import { Navigate, useNavigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState, useRef } from "react";
import API, { configureAxios, setCsrfToken } from "../services/api";
import SplashLoader from "./common/SplashLoader";

function PrivateRoute({ children }) {
  const { isAuthenticated, isLoading, getAccessTokenSilently, logout } =
    useAuth0();
  const navigate = useNavigate();
  const [isAuthorized, setIsAuthorized] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  // A network failure (no err.response — the request never reached the
  // server) isn't an auth problem at all, but the retry/final-failure logic
  // below used to fall through the same 401-handling branch into "Unable
  // to verify authorization" — actively misleading someone who's simply
  // offline (the OfflineBanner already tells them that correctly) into
  // thinking their session or credentials are broken.
  const [isOfflineError, setIsOfflineError] = useState(false);
  const isCheckingRef = useRef(false); // Prevent duplicate checks

  // The auth check can resolve faster than the splash's one CSS animation
  // cycle (1.1s — the zoom/rotate keyframes fade the logo to opacity 0 in
  // their own final stretch, see index.css), making it flash and vanish
  // before it's noticeable. Hold the splash up for the full cycle so the
  // fade-out is always the animation's own doing, never a hard cut.
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setMinSplashElapsed(true), 1100);
    return () => clearTimeout(timer);
  }, []);

  // Array of cool loading messages
  const loadingMessages = [
    // "Connecting your business dots — contacts, deals, and more!",
    // "Smart CRM that grows with your business.",
    // "Organize. Track. Close. Repeat — with DataCircles.",
    // "Turning your customer data into business insights.",
    // "Simplify CRM, amplify results.",
    // "Your 360° view of customers — loading in a sec!",
    // "Building stronger customer relationships... almost there!",
    // "Because managing data shouldn't feel like work.",
    // "Your sales pipeline, crystal clear in moments.",
    "DataCircles — where deals meet insights.",
  ];

  // Select a random message
  const randomMessage =
    loadingMessages[Math.floor(Math.random() * loadingMessages.length)];

  useEffect(() => {
    const phoneToken = localStorage.getItem("token");

    // Only proceed if authenticated or has phone token
    if (!isAuthenticated && !phoneToken) {
      return;
    }

    // Prevent duplicate authorization checks
    if (isCheckingRef.current) {
      return;
    }

    const checkAuthorization = async () => {
      isCheckingRef.current = true;

      try {
        // Configure axios with token getter
        await configureAxios(getAccessTokenSilently);

        // Add a small delay to ensure token is ready in production
        if (!phoneToken) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }

        const res = await API.get("/auth/me");
        // Only cache a user that actually came back: JSON.stringify(undefined)
        // is undefined, which setItem would store as the string "undefined"
        // and every JSON.parse of it then throws.
        if (res.data?.user) {
          localStorage.setItem("user", JSON.stringify(res.data.user));
        }

        // /auth/me proves the Auth0/phone IDENTITY is valid. GET /session/me
        // would additionally prove this browser holds a live DataCircles
        // session (dc_session) — the thing the 2-concurrent-session limit
        // enforces — but that only becomes meaningful once routes check it.
        //
        // The DataCircles session layer is informational for now: application
        // routes still authenticate off the Auth0/phone JWT, so a browser
        // without a dc_session cookie is NOT unauthorised. Both calls below
        // therefore run in the background, after authorisation is granted —
        // awaiting them put two always-401 round trips in front of every
        // private-route render, which is what made pages flash on navigation.
        // Await them (and restore the /login redirect) at the same time the
        // routes adopt sessionAuth, which is what makes the session
        // authoritative.
        setIsAuthorized(true);
        (async () => {
          try {
            await API.get("/session/me");
            const csrfRes = await API.get("/session/csrf-token");
            setCsrfToken(csrfRes.data.csrfToken);
          } catch {
            // No session established for this browser yet — nothing to do.
          }
        })();
        setIsOfflineError(false);
        setRetryCount(0); // Reset retry count on success
      } catch (err) {
        const errorData = err.response?.data;

        if (!err.response) {
          // Network failure, not an auth failure — api.js has already
          // retried this request twice internally before this catch even
          // runs, so there's nothing more to gain from this component's own
          // retry loop; go straight to the (accurately labeled) error state.
          setIsAuthorized(false);
          setIsOfflineError(true);
          setErrorMessage("");
          return;
        }

        // Handle specific error cases
        if (errorData?.error === "EMAIL_REQUIRED" && errorData?.requiresEmail) {
          navigate("/login", {
            state: {
              requiresEmail: true,
              provider: errorData.provider,
              name: errorData.name,
            },
          });
        } else if (err.response?.status === 428 || errorData?.error === "REGISTRATION_REQUIRED") {
          navigate("/login", {
            state: { requiresSetup: true },
          });
        } else if (err.response?.status === 401 && retryCount < 2) {
          // Retry on 401 errors up to 2 times with exponential backoff
          console.log(
            `Authorization check failed, retrying... (${retryCount + 1}/2)`
          );
          const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s

          setTimeout(() => {
            setRetryCount((prev) => prev + 1);
            isCheckingRef.current = false;
          }, delay);
        } else {
          // Final failure after retries
          setIsAuthorized(false);
          setIsOfflineError(false);
          setErrorMessage(
            errorData?.message ||
              "Unable to verify authorization. Please try again."
          );
          console.error("Authorization failed:", err);
        }
      } finally {
        isCheckingRef.current = false;
      }
    };

    checkAuthorization();
  }, [isAuthenticated, getAccessTokenSilently, navigate, retryCount]);

  const handleLogout = () => {
    const phoneToken = localStorage.getItem("token");
    // Clear browser history to prevent back button access
    window.history.replaceState(null, "", window.location.href);
    if (phoneToken) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.replace("/login");
    } else {
      logout({ logoutParams: { returnTo: window.location.origin } });
    }
  };

  const handleManualRetry = () => {
    setIsAuthorized(null);
    setErrorMessage("");
    setRetryCount(0);
    isCheckingRef.current = false;
  };

  // Show loading state
  if (
    !minSplashElapsed ||
    isLoading ||
    ((isAuthenticated || localStorage.getItem("token")) &&
      isAuthorized === null)
  ) {
    return (
      <>
        <SplashLoader />
        {retryCount > 0 && (
          <div
            className="fixed z-[10000] flex justify-center"
            style={{ top: 80, left: 0, right: 0 }}
          >
            <p className="rounded-full bg-white px-4 py-1.5 text-sm text-gray-500 shadow">
              Retrying connection... ({retryCount}/2)
            </p>
          </div>
        )}
      </>
    );
  }

  if (localStorage.getItem("superAdminToken")) {
    return <Navigate to="/super-admin-overview" />;
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated && !localStorage.getItem("token")) {
    return <Navigate to="/login" />;
  }

  // Show error state with manual retry option
  if (!isAuthorized && isAuthorized !== null) {
    return (
      <div className="fixed bg-gray-50 flex items-center justify-center px-4 z-20" style={{ top: 64, left: "var(--sidebar-width, 0px)", right: 0, bottom: 0 }}>
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-center max-w-md w-full">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isOfflineError ? "bg-gray-100" : "bg-red-100"}`}>
            {isOfflineError ? (
              <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.828-2.828m2.828 2.828L21 21M15.536 8.464a5 5 0 010 7.072m-7.072 0a5 5 0 010-7.072m-2.829-2.829a9 9 0 000 12.728M3 3l18 18" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            {isOfflineError ? "You're offline" : "Authorization Failed"}
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            {isOfflineError
              ? "Couldn't reach the server. Check your connection and try again."
              : (errorMessage ||
                "Unable to verify your access. This may be due to network issues or session problems.")}
          </p>
          <div className="space-y-3">
            <button
              onClick={handleManualRetry}
              className="w-full px-4 py-2.5 bg-blue-600 text-white font-medium text-sm rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Try Again
            </button>
            {!isOfflineError && (
              <button
                onClick={handleLogout}
                className="w-full px-4 py-2.5 bg-gray-100 text-gray-700 font-medium text-sm rounded-lg hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
              >
                Logout
              </button>
            )}
          </div>
          <p className="mt-4 text-xs text-gray-500">
            If this issue persists, please contact support.
          </p>
        </div>
      </div>
    );
  }

  return children;
}

export default PrivateRoute;
