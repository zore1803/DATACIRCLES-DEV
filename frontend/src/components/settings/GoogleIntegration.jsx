import CalendarClockIcon from "../common/CalendarClockIcon";
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, AlertCircle, Loader2, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import API from "../../services/api";

// Google's official multicolor "G" mark — there's no equivalent in
// lucide-react, and a plain calendar/video icon wouldn't make it obvious
// which provider this card is for.
function GoogleGIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18v6h7.73c4.51-4.18 7.09-10.36 7.09-17.65z" fill="#4285F4" />
      <path d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91H2.53v6.19C6.47 42.62 14.62 48 24 48z" fill="#34A853" />
      <path d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59v-6.19H2.53A23.98 23.98 0 0 0 0 24c0 3.87.93 7.53 2.53 10.78l8-6.19z" fill="#FBBC05" />
      <path d="M24 9.5c3.52 0 6.68 1.21 9.17 3.58l6.87-6.87C35.9 2.38 30.45 0 24 0 14.62 0 6.47 5.38 2.53 13.22l8 6.19C12.43 13.72 17.74 9.5 24 9.5z" fill="#EA4335" />
    </svg>
  );
}

export { GoogleGIcon };

function GoogleIntegration() {
  const location = useLocation();
  const navigate = useNavigate();

  const [status, setStatus] = useState(null); // { configured, connected, connectedEmail, staticDefault }
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await API.get("/auth/google/status");
      setStatus(res.data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The OAuth callback redirects back to /settings/google-integration with
  // ?googleMeet=connected|denied|error (see authController.googleCallback).
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const outcome = params.get("googleMeet");
    if (!outcome) return;

    if (outcome === "connected") {
      const email = params.get("email");
      toast.success(email ? `Connected as ${email}` : "Google account connected");
      fetchStatus();
    } else if (outcome === "denied") {
      toast.error("Google connection was cancelled");
    } else if (outcome === "error") {
      toast.error("Something went wrong connecting your Google account");
    }

    // Strip the query params so a refresh doesn't re-fire the toast.
    navigate(location.pathname, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await API.get("/auth/google/connect");
      if (res.data?.authUrl) {
        window.location.href = res.data.authUrl;
      } else {
        toast.error("Could not start Google connect flow");
        setConnecting(false);
      }
    } catch {
      toast.error("Could not start Google connect flow");
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await API.delete("/auth/google/disconnect");
      toast.success("Google account disconnected");
      setShowDisconnectModal(false);
      await fetchStatus();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to disconnect Google account");
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border-2 border-gray-200 shadow-xl rounded-2xl p-16 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  const configured = !!status?.configured;
  const connected = !!status?.connected;
  const staticDefault = !!status?.staticDefault;

  return (
    <div className="space-y-6">
      <div>
        {/* Not configured on the server at all */}
          {!configured && (
            <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border-2 border-gray-100 mb-2">
                <AlertCircle className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Google integration isn't set up yet</h3>
              <p className="text-gray-500 max-w-md mx-auto text-sm">
                This server hasn't been configured with Google OAuth credentials. Contact your administrator to enable Google Calendar & Meet.
              </p>
            </div>
          )}

          {/* Configured but not connected */}
          {configured && !connected && (
            <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center border-2 border-blue-100 mb-2">
                <CalendarClockIcon className="w-8 h-8 text-blue-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">No Google Account Connected</h3>
              <p className="text-gray-500 max-w-md mx-auto text-sm">
                Connect your Google account to create Google Calendar events and Google Meet links from your CRM. Meeting forms will use this connection automatically.
              </p>

              <div className="pt-4">
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  style={{ backgroundColor: "#0085FF" }}
                  className="hover:opacity-90 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2 shadow-sm"
                >
                  <GoogleGIcon className="w-4 h-4" />
                  {connecting ? "Redirecting…" : "Connect Google Account"}
                </button>
              </div>
            </div>
          )}

          {/* Connected */}
          {connected && (
            <div className="space-y-6">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-gray-500 font-medium mb-1">Connected Account</p>
                  <div className="flex items-center gap-2">
                    <GoogleGIcon className="w-5 h-5" />
                    <span className="text-lg font-semibold text-gray-900">
                      {status.connectedEmail || (staticDefault ? "Configured by administrator" : "Connected")}
                    </span>
                  </div>
                </div>
                {!staticDefault && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowDisconnectModal(true)}
                      className="px-4 py-2 rounded-xl font-medium text-red-600 bg-white border-2 border-red-100 hover:border-red-200 hover:bg-red-50 transition-colors text-sm"
                    >
                      Disconnect
                    </button>
                  </div>
                )}
              </div>

              <div className="border border-gray-200 rounded-xl p-6 space-y-3">
                <h4 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  What this enables
                </h4>
                <p className="text-sm text-gray-600">
                  When you click "Generate Link" on a meeting, the CRM creates a Google Calendar event under this account and inserts a live Google Meet link into the meeting's location field.
                </p>
              </div>

              {staticDefault && (
                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  This account is configured server-wide by your administrator and applies to every meeting — it can't be disconnected from here.
                </p>
              )}
            </div>
          )}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
        <ExternalLink className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-800">
          Prefer to connect while creating a meeting? The "Connect Google Account" link still works from any meeting form — Settings is just the primary place to manage the connection.
        </p>
      </div>

      {/* Disconnect confirmation modal */}
      {showDisconnectModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center border-2 border-red-100 mx-auto">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="font-bold text-gray-900 text-lg">Disconnect Google account?</h3>
              <p className="text-gray-500 text-sm">
                "Generate Link" will stop creating Google Meet links until you connect a Google account again. Existing meeting links won't be affected.
              </p>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-center gap-3">
              <button
                onClick={() => setShowDisconnectModal(false)}
                disabled={disconnecting}
                className="px-6 py-2.5 rounded-xl font-medium text-gray-700 bg-white border-2 border-gray-200 hover:bg-gray-50 transition-colors text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors shadow-sm"
              >
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GoogleIntegration;
