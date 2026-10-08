// utils/apiError.js
//
// One place that turns an API failure into (a) a category, (b) a user-facing
// message and (c) a FIXED toast id per category. Pages that load several things
// at once used to fire one toast per failed request (4-5 near-identical boxes);
// with a fixed id react-hot-toast replaces the existing toast instead of
// stacking a new one.
//
// The backend codes mapped here come from middlewares/subscriptionGate.js,
// middlewares/restrictByPlan.js and middlewares/checkPermission.js. NO_SUBSCRIPTION
// is deliberately silent: the interceptor in services/api.js redirects to
// /subscription and AppToaster shows the single friendly notice there.

import toast from "react-hot-toast";

const PREFIX = "api-error:";

// Backend `code` -> category.
const CODE_CATEGORY = {
  NO_SUBSCRIPTION: "no_subscription",
  SUBSCRIPTION_READ_ONLY: "read_only",
  MODULE_NOT_AVAILABLE: "plan_feature",
  FEATURE_NOT_AVAILABLE: "plan_feature",
  READ_NOT_ALLOWED: "plan_access",
  WRITE_NOT_ALLOWED: "plan_access",
  MODULE_LIMIT_REACHED: "plan_limit",
  LIMIT_REACHED: "plan_limit",
  STORAGE_LIMIT_EXCEEDED: "storage_limit",
  VERIFICATION_ERROR: "plan_check_failed",
  PLAN_CONFIG_ERROR: "plan_check_failed",
  CSRF_INVALID: "session",
};

// Used when the backend gave no usable text of its own.
const DEFAULT_MESSAGE = {
  read_only: "Your subscription is inactive, so this account is view-only. Subscribe to make changes.",
  plan_feature: "This feature isn't included in your current plan. Upgrade your plan to use it.",
  plan_access: "Your current plan doesn't allow this action. Upgrade your plan to use it.",
  plan_limit: "You've reached your plan's limit for this. Upgrade your plan to add more.",
  storage_limit: "You've reached your storage limit. Upgrade your plan or free up space.",
  plan_check_failed: "We couldn't verify your plan right now. Please try again in a moment.",
  session: "Your session expired. Please refresh the page and try again.",
  permission: "You don't have permission to do this. Ask your admin for access.",
  network: "Couldn't reach the server. Check your connection and try again.",
};

const textOf = (data) =>
  (typeof data?.message === "string" && data.message) ||
  (typeof data?.error === "string" && data.error) ||
  "";

/**
 * Classify an axios error.
 * @returns {{ category: string, message: string, silent: boolean, status?: number, code?: string }}
 */
export function classifyApiError(err, fallback = "Something went wrong. Please try again.") {
  const status = err?.response?.status;
  const data = err?.response?.data;
  const code = data?.code;

  if (!err?.response) {
    return { category: "network", message: DEFAULT_MESSAGE.network, silent: false };
  }

  let category = CODE_CATEGORY[code];

  // A 402 from subscriptionGate is always the read-only case.
  if (!category && status === 402) category = "read_only";
  // A 403 with no known code is a plain permission failure (checkPermission,
  // admin-only routes, ownership checks).
  if (!category && status === 403) category = "permission";

  if (!category) {
    // Anything else (400/404/409/500...): the backend's own text if it has one,
    // otherwise the caller's fallback. Grouped per fallback text, so identical
    // repeated failures collapse but different ones stay distinct.
    return {
      category: `other:${fallback}`,
      message: textOf(data) || fallback,
      silent: false,
      status,
      code,
    };
  }

  if (category === "no_subscription") {
    return { category, message: textOf(data) || fallback, silent: true, status, code };
  }

  // Server-supplied copy is specific (names the plan/module, includes counts,
  // differs per appStatus), so prefer it. Technical text (500 plan-check
  // failures, CSRF) is replaced with the friendly default instead.
  const serverText =
    category === "plan_check_failed" || category === "session" ? "" : textOf(data);
  let message = serverText || DEFAULT_MESSAGE[category] || fallback;
  if (category === "storage_limit" && data?.upgradeMessage) {
    message = `${message} ${data.upgradeMessage}`;
  }
  return { category, message, silent: false, status, code };
}

/**
 * Show one toast for an API failure. Repeated failures of the same category
 * replace each other instead of stacking. NO_SUBSCRIPTION shows nothing (the
 * redirect + notice own that case). Returns the classification.
 *
 * @param {object} err        the caught axios error
 * @param {string} fallback   message when nothing better is known
 * @param {object} [options]  extra react-hot-toast options (e.g. style, id override)
 */
export function showApiError(err, fallback, options = {}) {
  const info = classifyApiError(err, fallback);
  if (!info.silent) {
    toast.error(info.message, { id: `${PREFIX}${info.category}`, ...options });
  }
  return info;
}
