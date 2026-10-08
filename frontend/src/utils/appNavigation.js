
// there. A navigation request therefore can never be silently lost.
export const APP_NAVIGATE_EVENT = "dc:navigate";

// Only in-app absolute paths: "/subscription" yes; "https://evil.example" and "//evil.example"
// (protocol-relative) no, so this can never be turned into an open redirect.
export const isInternalPath = (to) =>
  typeof to === "string" && to.startsWith("/") && !to.startsWith("//") && !to.includes("\\");

/**
 * Ask the app to navigate. Returns true if an in-app listener took care of it, false if the
 * caller should fall back to a full-page navigation.
 */
export function requestAppNavigation(to, options = {}) {
  if (!isInternalPath(to) || typeof window === "undefined" || typeof CustomEvent === "undefined") return false;
  const event = new CustomEvent(APP_NAVIGATE_EVENT, {
    detail: { to, replace: Boolean(options.replace) },
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

/**
 * Builds the listener <AppInner> registers, bound to React Router's navigate(). Kept separate
 * from the component so it can be tested without rendering anything.
 */
export function createAppNavigateListener(navigate) {
  return (event) => {
    const { to, replace } = event.detail || {};
    if (!isInternalPath(to)) return; // not ours to handle: leave it unhandled
    event.preventDefault(); // tell the requester it was handled
    navigate(to, { replace: Boolean(replace) });
  };
}
