import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AppWrapper from './App.jsx'

// Capture a referral code from a shared link (?ref=CODE) HERE — before React
// mounts, before any router, before any redirect, before the Auth0 login
// round-trip. This is the only point guaranteed to still see the original
// URL's query string: an unauthenticated visitor hitting /?ref=CODE gets
// redirected to /login by PrivateRoute (which strips the query), and Auth0's
// redirect_uri is window.location.origin (also no query) — so capturing this
// any later (e.g. in an App useEffect) loses it. Persisted to localStorage;
// consumed by Login.jsx at registration. See PROJECT_STATE.md §11.
(function captureReferralCode() {
  try {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) localStorage.setItem("referralCode", ref.trim().toUpperCase());
  } catch (_) { /* non-fatal */ }
})();

// Drop a corrupt cached user before React mounts. Around thirty call sites
// do JSON.parse(localStorage.getItem("user")) — often guarded with
// `|| "{}"`, which only covers a MISSING key, not a present-but-invalid
// one. JSON.stringify(undefined) returns undefined, so setItem stored the
// literal string "undefined" whenever a /auth/me response arrived without a
// `user` field (an HTML error page, say), and every later parse threw
// "unexpected character at line 1 column 1", taking the app tree down.
// The writes are guarded now; this clears the bad value already sitting in
// existing browsers, which no write-side fix can reach.
(function dropCorruptStoredUser() {
  try {
    const raw = localStorage.getItem("user");
    if (raw === null) return;
    JSON.parse(raw);
  } catch (_) {
    try { localStorage.removeItem("user"); } catch (_) { /* non-fatal */ }
  }
})();

// Browsers let a native date input take up to six year digits (e.g.
// 20255-01-01). One capture-phase listener fixes every date / datetime-local
// field in the app: it trims the year to four digits before React reads the
// value, so no individual form needs its own max/maxLength handling.
(function limitDateYearToFourDigits() {
  document.addEventListener(
    'input',
    (e) => {
      const el = e.target;
      if (!el || el.tagName !== 'INPUT') return;
      if (el.type !== 'date' && el.type !== 'datetime-local') return;
      const match = /^(\d{5,6})(-.*)$/.exec(el.value);
      if (match) el.value = match[1].slice(0, 4) + match[2];
    },
    true,
  );

  // An impossible date (e.g. 31-09-275760) reports an empty value while the
  // field still shows the typed text, so the trim above can't see it. When
  // the user leaves the field with such an entry, clear it instead of
  // leaving a bogus date on screen.
  document.addEventListener(
    'focusout',
    (e) => {
      const el = e.target;
      if (!el || el.tagName !== 'INPUT') return;
      if (el.type !== 'date' && el.type !== 'datetime-local') return;
      if (el.validity && el.validity.badInput) el.value = '';
    },
    true,
  );
})();

createRoot(document.getElementById('root')).render(

    <AppWrapper />

)
