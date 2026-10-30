import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Loader2, X } from "lucide-react";
import API from "../../services/api";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";
import { INDIA_STATES } from "../../constants/addressOptions";
import { applyOrganizationSwitch } from "../../utils/organizations";

const LABEL = "block font-['Inter'] text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2";
const INPUT =
  "w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 font-['Inter']";

// "+ Create organization" from the sidebar switcher. Creates another organization for the signed-in
// person (same login, a brand-new workspace they administer) and moves the browser straight to it.
export default function CreateOrganizationModal({ isOpen, onClose }) {
  useBodyScrollLock(isOpen);
  const [form, setForm] = useState({ name: "", address: "", state: "", gstNumber: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    if (form.name.trim().length < 2 || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await API.post("/auth/organizations", {
        name: form.name.trim(),
        address: form.address.trim(),
        state: form.state,
        gstNumber: form.gstNumber.trim(),
      });
      applyOrganizationSwitch(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Could not create the organization. Please try again.");
      setSaving(false);
    }
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100009] bg-black/20 backdrop-blur-sm" onClick={saving ? undefined : onClose} />
      <div className="fixed dc-panel-card dc-panel-w z-[100010] flex flex-col overflow-hidden bg-white font-inter shadow-2xl">
        <div className="flex flex-shrink-0 items-center justify-between gap-1 border-b border-[#D9D9D9] bg-white px-6 py-4">
          <h2 className="text-[15px] font-normal uppercase leading-6 tracking-wide text-[#78788D]">Create organization</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            title="Close"
            aria-label="Close"
            className="flex h-5 w-5 items-center justify-center text-[#1C1B1F] transition-opacity hover:opacity-70"
          >
            <X className="h-[18px] w-[18px]" strokeWidth={2} />
          </button>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-8 py-6">
            <p className="text-[13px] text-[#64748B]">
              This creates a separate workspace with its own data and settings. You'll sign in with the same email and
              password, and can switch between organizations any time from the sidebar.
            </p>
            <div>
              <label className={LABEL}>
                Organization name <span className="text-[#FF4935]">*</span>
              </label>
              <input
                type="text"
                autoFocus
                maxLength={120}
                placeholder="ex.Acme Pvt Ltd"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className={INPUT}
                required
              />
            </div>
            <div>
              <label className={LABEL}>Address</label>
              <input
                type="text"
                maxLength={300}
                placeholder="ex.12, MG Road, Mumbai"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                className={INPUT}
              />
            </div>
            <div>
              <label className={LABEL}>State</label>
              <div className="relative">
                <select
                  value={form.state}
                  onChange={(e) => set("state", e.target.value)}
                  className={`${INPUT} cursor-pointer appearance-none bg-white pr-10 ${form.state ? "" : "text-[#64748B]"}`}
                >
                  <option value="">Select state</option>
                  {INDIA_STATES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
              </div>
            </div>
            <div>
              <label className={LABEL}>GSTIN</label>
              <input
                type="text"
                maxLength={20}
                placeholder="ex.27ABCDE1234F1Z5"
                value={form.gstNumber}
                onChange={(e) => set("gstNumber", e.target.value.toUpperCase())}
                className={INPUT}
              />
            </div>
            {error && <p className="text-[13px] font-medium text-[#DC2626]">{error}</p>}
          </div>

          <div className="flex flex-shrink-0 items-center justify-end gap-3 border-t border-gray-100 bg-white px-4 py-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-[25px] border border-gray-200 px-6 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || form.name.trim().length < 2}
              className="flex items-center gap-2 rounded-[25px] bg-[#158FFF] px-6 py-2 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Creating..." : "Create & switch"}
            </button>
          </div>
        </form>
      </div>
    </>,
    document.body,
  );
}
