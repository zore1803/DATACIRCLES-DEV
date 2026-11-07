import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import API from "../../services/api";

const APP_ID = import.meta.env.VITE_INTERCOM_APP_ID;

// Desktop: unchanged (90 / 24). Below lg (1024px) the header's round "+" button
// floats bottom-right (80px up, 56px tall, 16px from the edge), so the launcher
// is stacked just above it, centred on the same vertical line.
const isMobileViewport = () =>
  typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;
// The 48px button sits 20px up, or 76px when a list page's bottom pagination
// bar is showing (see .dc-fab in index.css); the launcher goes 12px above it.
const hasBottomBar = () => !!document.querySelector("div.fixed.bottom-0.right-0.border-t");
const launcherPadding = () =>
  isMobileViewport()
    ? { vertical_padding: hasBottomBar() ? 144 : 88, horizontal_padding: 16 }
    : { vertical_padding: 90, horizontal_padding: 24 };

function loadIntercomScript(appId) {
  if (window.Intercom) return;

  const w = window;
  const ic = w.Intercom;
  if (typeof ic === "function") {
    ic("reattach_activator");
    ic("update", w.intercomSettings);
  } else {
    const i = function () {
      i.c(arguments);
    };
    i.q = [];
    i.c = function (args) {
      i.q.push(args);
    };
    w.Intercom = i;
    const load = () => {
      const s = document.createElement("script");
      s.type = "text/javascript";
      s.async = true;
      s.src = `https://widget.intercom.io/widget/${appId}`;
      document.head.appendChild(s);
    };
    if (document.readyState === "complete") {
      load();
    } else {
      w.addEventListener("load", load);
    }
  }
}

/**
 * Boots the Intercom Messenger for the signed-in user. Waits for both the
 * profile (/auth/me) and the server-signed JWT (/auth/intercom-jwt) before
 * booting — this workspace has Messenger JWT security enforced, so a boot
 * without intercom_user_jwt is rejected outright.
 */
export default function Intercom({ isAuthenticated, isSetupComplete }) {
  const location = useLocation();
  const bootedRef = useRef(false);

  useEffect(() => {
    if (!APP_ID) return;

    if (!isAuthenticated || !isSetupComplete) {
      if (bootedRef.current && window.Intercom) {
        window.Intercom("shutdown");
        bootedRef.current = false;
      }
      return;
    }

    let cancelled = false;

    const boot = async () => {
      try {
        const [{ data: me }, { data: jwtRes }] = await Promise.all([
          API.get("/auth/me"),
          API.get("/auth/intercom-jwt"),
        ]);
        if (cancelled) return;

        const user = me.user;
        loadIntercomScript(APP_ID);

        window.intercomSettings = {
          api_base: "https://api-iam.intercom.io",
          app_id: APP_ID,
          intercom_user_jwt: jwtRes.token,
          name: user.name,
          created_at: user.createdAt
            ? Math.floor(new Date(user.createdAt).getTime() / 1000)
            : undefined,
          // Default launcher sits flush in the bottom-right corner, right on
          // top of the fixed pagination bar every list page has there —
          // nudged up so it always clears it, app-wide (not per-page).
          ...launcherPadding(),
        };

        window.Intercom?.("boot", window.intercomSettings);
        bootedRef.current = true;
      } catch (err) {
        // Intercom being unreachable/misconfigured shouldn't break the app.
        console.error("Intercom boot failed:", err);
      }
    };

    boot();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isSetupComplete]);

  // Re-position the launcher when crossing the mobile/desktop breakpoint
  // (rotation, window resize).
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    let last = "";
    const onChange = () => {
      if (!bootedRef.current || !window.Intercom) return;
      const p = launcherPadding();
      const key = `${p.vertical_padding}/${p.horizontal_padding}`;
      if (key === last) return;
      last = key;
      window.Intercom("update", p);
    };
    mq.addEventListener("change", onChange);
    // The pagination bar mounts/unmounts as lists load and routes change, so
    // watch the DOM (throttled to one check per frame).
    let raf = 0;
    const mo = new MutationObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        onChange();
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      mq.removeEventListener("change", onChange);
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Let the Messenger re-check unread counts / launcher position on route change.
  useEffect(() => {
    if (bootedRef.current && window.Intercom) {
      window.Intercom("update");
    }
  }, [location.pathname]);

  useEffect(() => {
    return () => {
      if (bootedRef.current && window.Intercom) {
        window.Intercom("shutdown");
      }
    };
  }, []);

  return null;
}
