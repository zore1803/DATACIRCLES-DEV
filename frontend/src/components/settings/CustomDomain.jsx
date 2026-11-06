import PlusIcon from "../common/PlusIcon";
import React, { useState } from "react";
import {
  Globe,
  AlertCircle,
  Copy,
  CheckCircle2,
  X,
  Loader2,
  ExternalLink,
} from "lucide-react";
import toast from "react-hot-toast";

function CustomDomain() {
  // Available States: "NOT_CONNECTED", "DNS_SETUP", "VERIFYING", "SUCCESS", "FAILED", "CONNECTED"
  const [uiState, setUiState] = useState("NOT_CONNECTED");
  
  // Modals
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  
  const [domainInput, setDomainInput] = useState("");
  const [activeDomain, setActiveDomain] = useState("");

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const startConnect = () => {
    setDomainInput("");
    setShowConnectModal(true);
  };

  const proceedToDnsSetup = () => {
    if (!domainInput.trim()) return;
    // Strip http/https if pasted by accident
    const cleanDomain = domainInput.replace(/^https?:\/\//, "").trim();
    setDomainInput(cleanDomain);
    setShowConnectModal(false);
    setUiState("DNS_SETUP");
  };

  const simulateVerification = () => {
    setUiState("VERIFYING");
    setTimeout(() => {
      // For demonstration, let's just make it success if they type 'success', fail otherwise? 
      // Actually, let's just randomly succeed or fail for demo, or just succeed.
      // We will just succeed to keep the demo clean.
      setActiveDomain(domainInput);
      setUiState("SUCCESS");
    }, 2000);
  };

  const simulateVerificationFailure = () => {
    setUiState("VERIFYING");
    setTimeout(() => {
      setUiState("FAILED");
    }, 2000);
  };

  const handleDisconnect = () => {
    setActiveDomain("");
    setUiState("NOT_CONNECTED");
    setShowDisconnectModal(false);
    toast.success("Domain disconnected");
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border-2 border-gray-200 shadow-xl rounded-2xl overflow-hidden">
        
        {/* Header Section */}
        <div className="p-4 sm:p-8 border-b-2 border-gray-100 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 sm:p-2.5 rounded-xl flex-shrink-0">
              <Globe className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-xl font-bold text-gray-900">
                Custom Domain
              </h2>
              <p className="text-xs sm:text-sm text-gray-600">
                Use your own domain for customer-facing document links and public pages.
              </p>
            </div>
          </div>
          {uiState === "CONNECTED" && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 text-green-700 rounded-full text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              Connected
            </div>
          )}
        </div>

        {/* Content Section based on state */}
        <div className="p-4 sm:p-8">
          
          {/* NOT CONNECTED STATE */}
          {uiState === "NOT_CONNECTED" && (
            <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border-2 border-gray-100 mb-2">
                <Globe className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">No Custom Domain Connected</h3>
              <p className="text-gray-500 max-w-md mx-auto text-sm">
                Your custom domain will be used for public document links shared with customers. Currently using default CRM domain.
              </p>
              
              <div className="pt-4">
                <button
                  onClick={startConnect}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2 shadow-sm"
                >
                  <PlusIcon className="w-4 h-4" />
                  Connect Custom Domain
                </button>
              </div>
            </div>
          )}

          {/* DNS SETUP STATE */}
          {uiState === "DNS_SETUP" && (
            <div className="space-y-6 max-w-3xl">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Connect your domain</h3>
                <p className="text-gray-600 text-sm mt-1">
                  Add the following DNS record to your domain provider for <span className="font-semibold text-gray-900">{domainInput}</span>.
                </p>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-gray-100/50 text-gray-600 font-medium border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3">Value</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      <tr className="bg-white">
                        <td className="px-4 py-4 text-gray-900 font-mono">CNAME</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-gray-900">{domainInput.split('.')[0]}</span>
                            <button onClick={() => handleCopy(domainInput.split('.')[0])} className="text-gray-400 hover:text-blue-600">
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-gray-900">cname.datacircles.in</span>
                            <button onClick={() => handleCopy("cname.datacircles.in")} className="text-gray-400 hover:text-blue-600">
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-flex items-center px-2 py-1 bg-yellow-50 text-yellow-700 rounded-md text-xs font-medium border border-yellow-200">
                            Pending
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
                <h4 className="font-semibold text-blue-900 text-sm">Instructions</h4>
                <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
                  <li>Open your domain provider (e.g., GoDaddy, Cloudflare, Route53).</li>
                  <li>Go to DNS settings.</li>
                  <li>Add the CNAME record shown above.</li>
                  <li>Return here and click "Verify Domain".</li>
                </ol>
                <p className="text-xs text-blue-600 mt-2 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  DNS changes can take some time to become active.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
                <button
                  onClick={() => setUiState("NOT_CONNECTED")}
                  className="px-5 py-2.5 rounded-xl font-medium text-gray-700 bg-white border-2 border-gray-200 hover:bg-gray-50 transition-colors text-sm"
                >
                  Back
                </button>
                <button
                  onClick={simulateVerification}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors shadow-sm"
                >
                  Verify Domain
                </button>
                {/* Developer debug button to trigger failure state easily */}
                <button
                  onClick={simulateVerificationFailure}
                  className="text-xs text-gray-400 underline ml-auto hover:text-gray-600"
                >
                  (Test Failure)
                </button>
              </div>
            </div>
          )}

          {/* VERIFYING STATE */}
          {uiState === "VERIFYING" && (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
              <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
              <h3 className="text-lg font-semibold text-gray-900">Verifying your domain...</h3>
              <p className="text-gray-500 text-sm">Please wait while we check the DNS records.</p>
            </div>
          )}

          {/* SUCCESS STATE */}
          {uiState === "SUCCESS" && (
            <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center border-2 border-green-100 mb-2">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Domain Connected</h3>
              <p className="text-gray-600 max-w-md mx-auto text-sm">
                <span className="font-semibold text-gray-900">{activeDomain}</span> is connected successfully.
              </p>
              
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mt-4 text-left w-full max-w-md mx-auto">
                <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Public document links will now use:</p>
                <p className="text-sm font-mono text-blue-600">https://{activeDomain}/view/...</p>
              </div>
              
              <div className="pt-4 flex items-center justify-center gap-3">
                <button
                  onClick={() => setUiState("CONNECTED")}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors shadow-sm"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* FAILED STATE */}
          {uiState === "FAILED" && (
            <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center border-2 border-red-100 mb-2">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Domain verification failed</h3>
              <p className="text-gray-600 max-w-md mx-auto text-sm">
                We couldn't find the required DNS record yet. DNS changes can sometimes take up to 24 hours to propagate across the internet.
              </p>
              
              <div className="pt-4 flex items-center justify-center gap-3">
                <button
                  onClick={() => setUiState("DNS_SETUP")}
                  className="px-6 py-2.5 rounded-xl font-medium text-gray-700 bg-white border-2 border-gray-200 hover:bg-gray-50 transition-colors text-sm"
                >
                  View DNS Instructions
                </button>
                <button
                  onClick={simulateVerification}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors shadow-sm"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {/* CONNECTED STATE (Main Dashboard View) */}
          {uiState === "CONNECTED" && (
            <div className="space-y-6">
              
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-gray-500 font-medium mb-1">Active Domain</p>
                  <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-gray-400" />
                    <span className="text-lg font-semibold text-gray-900">{activeDomain}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setDomainInput(activeDomain);
                      setUiState("DNS_SETUP"); // They can re-view records if they want
                    }}
                    className="px-4 py-2 rounded-xl font-medium text-gray-700 bg-white border-2 border-gray-200 hover:bg-gray-50 transition-colors text-sm"
                  >
                    Manage
                  </button>
                  <button
                    onClick={() => setShowDisconnectModal(true)}
                    className="px-4 py-2 rounded-xl font-medium text-red-600 bg-white border-2 border-red-100 hover:border-red-200 hover:bg-red-50 transition-colors text-sm"
                  >
                    Disconnect
                  </button>
                </div>
              </div>

              <div className="border border-gray-200 rounded-xl p-6 space-y-3">
                 <h4 className="font-semibold text-gray-900 text-sm">Document Links</h4>
                 <p className="text-sm text-gray-600">Your public documents (Invoices, Estimates, Purchase Orders) are now available via your custom domain.</p>
                 <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 flex items-center justify-between mt-2">
                   <span className="font-mono text-sm text-gray-800">https://{activeDomain}/view/[document-id]</span>
                   <ExternalLink className="w-4 h-4 text-gray-400" />
                 </div>
              </div>
              
            </div>
          )}

        </div>
      </div>

      {/* Connect Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-semibold text-gray-900 text-lg">Connect Custom Domain</h3>
              <button
                onClick={() => setShowConnectModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Domain or Subdomain
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  placeholder="e.g., billing.mycompany.com"
                  className="w-full pl-10 pr-4 py-2.5 border-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all border-gray-300 hover:border-gray-400"
                  autoFocus
                />
                <Globe className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Enter the domain or subdomain you want to use for your public document links.
              </p>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
              <button
                onClick={() => setShowConnectModal(false)}
                className="px-4 py-2 rounded-xl font-medium text-gray-700 hover:bg-gray-200 bg-gray-100 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={proceedToDnsSetup}
                disabled={!domainInput.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-xl font-semibold text-sm transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect Modal */}
      {showDisconnectModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center border-2 border-red-100 mx-auto">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="font-bold text-gray-900 text-lg">Disconnect custom domain?</h3>
              <p className="text-gray-500 text-sm">
                This will stop using your custom domain for new public document links. Existing links might become broken if the DNS records are removed.
              </p>
            </div>
            
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-center gap-3">
              <button
                onClick={() => setShowDisconnectModal(false)}
                className="px-6 py-2.5 rounded-xl font-medium text-gray-700 bg-white border-2 border-gray-200 hover:bg-gray-50 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDisconnect}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors shadow-sm"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default CustomDomain;
