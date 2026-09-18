import React from "react";
import { Toaster, ToastBar, toast } from "react-hot-toast";
import { X } from "lucide-react";

// Shared toast renderer used app-wide (see PROJECT-level note: every page previously
// mounted its own bare <Toaster/>, which never showed a dismiss control). Rendering the
// toast body ourselves via the ToastBar children render-prop lets us add a close (X)
// button without touching react-hot-toast's internals.
const AppToaster = (props) => (
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

export default AppToaster;
