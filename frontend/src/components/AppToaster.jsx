import React, { useEffect } from "react";
import { Toaster, ToastBar, toast } from "react-hot-toast";
import { X } from "lucide-react";
import {
  NO_SUBSCRIPTION_NOTICE_KEY,
  NO_SUBSCRIPTION_TOAST_ID,
  NO_SUBSCRIPTION_MESSAGE,
} from "../services/api";

// The "no active plan" notice itself is defined (and normally shown) by the NO_SUBSCRIPTION
// interceptor in services/api.js, as the user is moved to /subscription inside the running app.
// The fixed id means any number of mounted toasters can never show it twice.

// Shared toast renderer used app-wide (see PROJECT-level note: every page previously
// mounted its own bare <Toaster/>, which never showed a dismiss control). Rendering the
// toast body ourselves via the ToastBar children render-prop lets us add a close (X)
// button without touching react-hot-toast's internals.
const AppToaster = (props) => {
  // Fallback path only: if the interceptor had to do a full page load (no in-app navigation
  // available) it leaves the notice in sessionStorage; show it once here. Whichever toaster
  // mounts first consumes it; the fixed id covers the rest.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(NO_SUBSCRIPTION_NOTICE_KEY)) {
        sessionStorage.removeItem(NO_SUBSCRIPTION_NOTICE_KEY);
        toast(NO_SUBSCRIPTION_MESSAGE, { id: NO_SUBSCRIPTION_TOAST_ID, duration: 8000 });
      }
    } catch {
      // sessionStorage unavailable — skip the notice.
    }
  }, []);

  return (
  <Toaster
    position="top-right"
    toastOptions={{ duration: 5000, style: { borderRadius: "9999px" } }}
    // Full-width document panels (Invoice/Quotation/Pro Forma/Delivery Challan)
    // render at z-[10000]+, above react-hot-toast's default z-index of 9999 —
    // toasts fired while one of those is open were rendering invisibly behind
    // it. Bumped above every z-index used in the app (highest seen: 100010).
    containerStyle={{ zIndex: 999999 }}
    {...props}
  >
    {(t) => (
      // Every toast in the store is rendered. The duplicate "No subscription found" errors are
      // not hidden here any more - returning null left an empty, space-taking box behind for each
      // one - they are never created (see the toast.error guard in services/api.js).
      <ToastBar toast={t}>
        {({ icon, message }) => (
          <>
            {icon}
            {message}
            {t.type !== "loading" && (
              <button
                type="button"
                onClick={(e) => {
                  // Defensive: this toast can render inside stacked/overlaid
                  // panels (full-width document editors, the offline banner)
                  // — stop the click from doing anything else on its way up.
                  e.stopPropagation();
                  toast.dismiss(t.id);
                }}
                className="ml-2 p-0.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors pointer-events-auto"
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            )}
          </>
        )}
      </ToastBar>
    )}
  </Toaster>
  );
};

export default AppToaster;
