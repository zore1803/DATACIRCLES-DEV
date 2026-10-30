// Moving the browser to another of the signed-in person's organizations.
//
// The server answers a switch (POST /auth/switch-org) or an organization creation with
//   { token, activeUserId, user }
//   - token: a fresh session token pinned to that organization's record. Present for password and
//     phone sessions; null for Google (Auth0) sessions, which keep their own token.
//   - activeUserId: the record to act as. Google sessions send it on every request as the
//     X-Active-User header (services/api.js); the server only honours it when it is one of that
//     person's own records.
//
// A full page load (not a client-side navigation) is deliberate: every list, cache and context in
// the app is scoped to the organization, and a reload is the one way to guarantee nothing from the
// previous organization is left on screen.
export function applyOrganizationSwitch(data) {
  if (data.token) localStorage.setItem("token", data.token);
  if (data.activeUserId) localStorage.setItem("activeUserId", String(data.activeUserId));
  if (data.user) {
    try {
      localStorage.setItem("user", JSON.stringify(data.user));
    } catch {
      // Storage full or blocked: the next /auth/me refills it.
    }
  }
  window.location.assign("/");
}
