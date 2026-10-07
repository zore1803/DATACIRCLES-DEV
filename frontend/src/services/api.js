// services/api.js
import axios from "axios";

const API = axios.create({
  baseURL: `${import.meta.env.VITE_APP_API_URL}/api`,
  timeout: 30000, // 30 second timeout for production
  // Required so the dc_session HttpOnly cookie (DataCircles application
  // session — see backend/services/sessionService.js) is sent on
  // cross-site requests; frontend and backend are on different domains in
  // every environment this app deploys to.
  withCredentials: true,
});

// Token refresh management
let getAccessTokenSilently = null;
let isRefreshing = false;
let failedQueue = [];

// In-memory only — never localStorage. This is the double-submit CSRF
// token derived server-side from the session's csrfSecret
// (backend/services/sessionService.js deriveCsrfToken); it authorizes
// mutating requests once a DataCircles session cookie is set.
let csrfToken = null;

export const setCsrfToken = (token) => {
  csrfToken = token;
};

// Lazily (re)fetch the double-submit CSRF token when it's missing. The
// in-memory `csrfToken` above does NOT survive a full page load, and the
// only thing that otherwise repopulates it is PrivateRoute's mount effect
// (GET /session/csrf-token) — so a mutating request fired from a freshly
// loaded tab that reached the app by any other path would go out with no
// X-CSRF-Token and be rejected 403 CSRF_INVALID by the backend csrfCheck
// middleware. GET /session/csrf-token re-derives the token from the
// existing dc_session cookie without disturbing the session itself.
//
// Single-flight: concurrent mutating requests share one in-flight fetch
// rather than each firing their own.
let csrfFetchPromise = null;

const fetchCsrfToken = () => {
  if (!csrfFetchPromise) {
    csrfFetchPromise = API.get("/session/csrf-token")
      .then((res) => {
        setCsrfToken(res.data.csrfToken);
        return res.data.csrfToken;
      })
      .catch((err) => {
        // No dc_session cookie yet (401) or a transient failure — leave
        // csrfToken null and let the original request proceed so it fails
        // with a clear server-side 401/403 instead of hanging here.
        console.warn(
          "Could not fetch CSRF token:",
          err.response?.status || err.message,
        );
        return null;
      })
      .finally(() => {
        csrfFetchPromise = null;
      });
  }
  return csrfFetchPromise;
};

/**
 * Establishes a DataCircles application session after Auth0 login or phone
 * OTP verification succeeds. Sets the dc_session HttpOnly cookie and
 * returns the CSRF token for mutating requests. Surfaces a
 * SESSION_LIMIT_REACHED error distinctly so callers can show the
 * "maximum 2 active sessions" message instead of a generic failure.
 */
export const establishSession = async () => {
  try {
    const res = await API.post("/session/establish");
    setCsrfToken(res.data.csrfToken);
    return res.data;
  } catch (error) {
    if (error.response?.data?.code === "SESSION_LIMIT_REACHED") {
      const limitError = new Error(error.response.data.message);
      limitError.code = "SESSION_LIMIT_REACHED";
      throw limitError;
    }
    throw error;
  }
};

/**
 * Process the queue of failed requests after token refresh
 */
const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

/**
 * Configure Axios with Auth0 token getter function
 */
export const configureAxios = (tokenFunction) => {
  getAccessTokenSilently = tokenFunction;
};

/**
 * Request Interceptor - Add authentication tokens to headers
 */
API.interceptors.request.use(
  async (config) => {
    try {
      // Attach the CSRF token on mutating requests once a DataCircles
      // session has been established (see establishSession above). Safe
      // methods don't need it; the backend's csrfCheck middleware only
      // enforces it on routes that opt into sessionAuth.
      //
      // If the token is missing (e.g. wiped by a page reload), fetch it
      // first so this request isn't the one that eats a 403. Auth/session
      // endpoints are skipped — they run before any dc_session exists
      // (/auth/*), mint the token themselves (/session/establish), or ARE
      // the fetch we'd be calling (/session/csrf-token).
      const method = (config.method || "get").toLowerCase();
      const isMutating = !["get", "head", "options"].includes(method);
      const url = config.url || "";
      const isPreSessionEndpoint =
        url.includes("/session/") || url.includes("/auth/");
      if (isMutating) {
        if (!csrfToken && !isPreSessionEndpoint) {
          await fetchCsrfToken();
        }
        if (csrfToken) {
          config.headers["X-CSRF-Token"] = csrfToken;
        }
      }

      // If Authorization header is already set (e.g., tempToken), don't override it
      if (config.headers.Authorization) {
        return config;
      }

      // Priority 1: Check for phone token
      const phoneToken = localStorage.getItem("token");
      if (phoneToken) {
        config.headers["x-phone-token"] = phoneToken;
        return config;
      }

      // Priority 2: Check for super admin token
      const superAdminToken = localStorage.getItem("superAdminToken");
      if (superAdminToken) {
        config.headers.Authorization = `Bearer ${superAdminToken}`;
        return config;
      }

      // Priority 3: Use Auth0 token
      if (getAccessTokenSilently) {
        const token = await getAccessTokenSilently({
          authorizationParams: {
            audience: import.meta.env.VITE_APP_AUTH0_AUDIENCE,
            scope: "openid profile email",
          },
        });

        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
    } catch (error) {
      console.error("Error getting access token:", error);
      // Don't throw - let the request proceed and fail at the server level
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response Interceptor - Handle 401 errors and retry with fresh token
 */
API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 Unauthorized errors
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't retry for specific endpoints to avoid infinite loops
      // /session/* is included deliberately: application routes still
      // authenticate off the Auth0/phone JWT, so a browser with no
      // dc_session cookie 401s these on EVERY private-route mount. Refreshing
      // the Auth0 token and replaying can't produce a cookie, so the retry is
      // pure latency — and it runs while PrivateRoute is showing its checking
      // screen, which is what makes pages flash on navigation.
      const noRetryEndpoints = [
        "/auth/me",
        "/auth/login",
        "/auth/logout",
        "/session/",
      ];
      const shouldSkipRetry = noRetryEndpoints.some((endpoint) =>
        originalRequest.url?.includes(endpoint)
      );

      if (shouldSkipRetry) {
        return Promise.reject(error);
      }

      // Check authentication type
      const phoneToken = localStorage.getItem("token");
      const superAdminToken = localStorage.getItem("superAdminToken");

      // Phone auth and super admin can't be refreshed - fail immediately
      if (phoneToken || superAdminToken) {
        return Promise.reject(error);
      }

      // Handle Auth0 token refresh with queue
      if (getAccessTokenSilently) {
        // If already refreshing, queue this request
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then((token) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return API(originalRequest);
            })
            .catch((err) => {
              return Promise.reject(err);
            });
        }

        // Mark this request as a retry to prevent infinite loops
        originalRequest._retry = true;
        isRefreshing = true;

        try {
          // Get fresh token from Auth0
          const newToken = await getAccessTokenSilently({
            authorizationParams: {
              audience: import.meta.env.VITE_APP_AUTH0_AUDIENCE,
              scope: "openid profile email",
            },
            cacheMode: "off", // Force fresh token, bypass cache
          });

          if (newToken) {
            // Update the failed request with new token
            originalRequest.headers.Authorization = `Bearer ${newToken}`;

            // Process all queued requests with new token
            processQueue(null, newToken);

            // Retry the original request
            return API(originalRequest);
          }
        } catch (refreshError) {
          // Token refresh failed - reject all queued requests
          processQueue(refreshError, null);

          // Clear tokens and redirect to login
          console.error("Token refresh failed:", refreshError);
          localStorage.removeItem("token");
          localStorage.removeItem("user");

          // Only redirect if not already on login page
          if (!window.location.pathname.includes("/login")) {
            window.location.href = "/login";
          }

          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }
    }

    // Handle other errors or non-401 responses
    return Promise.reject(error);
  }
);

/**
 * Response Interceptor - Reactive CSRF recovery
 *
 * A 403 with code CSRF_INVALID means the in-memory token was stale or
 * missing when the request went out (typically: a page reload wiped it and
 * the proactive fetch in the request interceptor lost a race, or the
 * session was rotated). Drop the cached token, re-derive it from the live
 * dc_session cookie, and replay the request once. Guarded per-request so a
 * genuinely un-fixable token can't loop.
 */
API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isCsrfError =
      error.response?.status === 403 &&
      error.response?.data?.code === "CSRF_INVALID";

    if (isCsrfError && originalRequest && !originalRequest._csrfRetry) {
      originalRequest._csrfRetry = true;
      csrfToken = null; // force a real re-fetch rather than reusing the rejected value
      const fresh = await fetchCsrfToken();
      if (fresh) {
        originalRequest.headers["X-CSRF-Token"] = fresh;
        return API(originalRequest);
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Response Interceptor - No active subscription
 *
 * The backend (middlewares/restrictByPlan.js) answers 403 with
 * { code: "NO_SUBSCRIPTION" } when the organization has no subscription. Any
 * page can hit that, so send the user to /subscription from here instead of
 * every page handling it on its own (Dashboard still does, harmlessly).
 *
 * Only that exact status + code matches: 401 refresh, CSRF_INVALID and ordinary
 * permission 403s all pass straight through untouched. The error is always
 * re-rejected so callers' own catch blocks still run. No redirect while already
 * on a /subscription page (its own requests could return the same code), and
 * only once, since several in-flight requests can fail together.
 */
let isRedirectingToSubscription = false;

// A page that loads several things at once gets several NO_SUBSCRIPTION
// failures, and each one's own catch block would show its own error toast
// (4-5 identical "No subscription found" messages). For a few seconds after
// the first one, AppToaster hides error toasts (see isNoSubscriptionBurst) and
// shows ONE friendly notice instead, on the page the user lands on.
const NO_SUBSCRIPTION_BURST_MS = 3000;
let noSubscriptionUntil = 0;
export const isNoSubscriptionBurst = () => Date.now() < noSubscriptionUntil;

// Handed to the next page load through sessionStorage, because the redirect
// below is a full page load and anything shown before it would vanish.
export const NO_SUBSCRIPTION_NOTICE_KEY = "dc:no-subscription-notice";

API.interceptors.response.use(
  (response) => response,
  (error) => {
    const isNoSubscription =
      error.response?.status === 403 &&
      error.response?.data?.code === "NO_SUBSCRIPTION";

    if (isNoSubscription) {
      noSubscriptionUntil = Date.now() + NO_SUBSCRIPTION_BURST_MS;
    }

    if (
      isNoSubscription &&
      !isRedirectingToSubscription &&
      !window.location.pathname.startsWith("/subscription")
    ) {
      isRedirectingToSubscription = true;
      try {
        sessionStorage.setItem(NO_SUBSCRIPTION_NOTICE_KEY, "1");
      } catch {
        // Storage can be blocked (private mode); the redirect still works,
        // the friendly notice is just skipped.
      }
      window.location.href = "/subscription";
    }

    return Promise.reject(error);
  }
);

/**
 * Optional: Add request retry logic for network errors
 */
API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config } = error;

    // Retry on network errors (not 4xx/5xx)
    if (!error.response && config && !config.__isRetryRequest) {
      config.__isRetryRequest = true;
      config.__retryCount = config.__retryCount || 0;

      // Retry up to 2 times with exponential backoff
      if (config.__retryCount < 2) {
        config.__retryCount += 1;
        const delayMs = Math.pow(2, config.__retryCount) * 1000; // 2s, 4s

        console.log(
          `Network error, retrying request (${config.__retryCount}/2)...`
        );

        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return API(config);
      }
    }

    return Promise.reject(error);
  }
);

export default API;
