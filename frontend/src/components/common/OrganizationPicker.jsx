import { Building2, ChevronRight, Loader2 } from "lucide-react";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

const getInitials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "O";

// "Which organization do you want to sign in to?" Shown after a person has proven who they are
// (password, OTP or Google) and belongs to more than one organization.
//   organizations: [{ userId, name, role }]
//   onSelect(userId): continue as that organization
//   onCancel(): optional, offers a way back (e.g. to the sign-in form)
export default function OrganizationPicker({ organizations, onSelect, onCancel, busyId = null, error = "" }) {
  useBodyScrollLock(true);

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/20 px-4 backdrop-blur-sm">
      <div className="w-full max-w-[440px] rounded-[18px] bg-white p-6 shadow-2xl sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#EAF4FF]">
          <Building2 className="h-6 w-6 text-[#0085FF]" />
        </div>
        <h2 className="mt-4 text-center font-['Inter'] text-[22px] font-semibold text-[#0F172A]">
          Choose an organization
        </h2>
        <p className="mt-1 text-center font-['Inter'] text-[14px] text-[#475569]">
          You belong to more than one. Pick where you'd like to continue.
        </p>

        <div className="mt-6 flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
          {organizations.map((org) => (
            <button
              key={org.userId}
              type="button"
              disabled={busyId !== null}
              onClick={() => onSelect(org.userId)}
              className="flex w-full items-center gap-3 rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-left transition-colors hover:border-[#0085FF] hover:bg-[#F5FAFF] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#0085FF] font-['Inter'] text-[14px] font-semibold text-white">
                {getInitials(org.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-['Inter'] text-[14px] font-semibold text-[#0F172A]">{org.name}</span>
                <span className="block font-['Inter'] text-[12px] capitalize text-[#64748B]">{org.role || "member"}</span>
              </span>
              {busyId === org.userId ? (
                <Loader2 className="h-4 w-4 animate-spin text-[#0085FF]" />
              ) : (
                <ChevronRight className="h-4 w-4 text-[#94A3B8]" />
              )}
            </button>
          ))}
        </div>

        {error && <p className="mt-3 text-center font-['Inter'] text-[13px] font-medium text-[#DC2626]">{error}</p>}

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busyId !== null}
            className="mt-5 w-full rounded-full border border-[#E2E8F0] bg-white py-2.5 font-['Inter'] text-[14px] font-medium text-[#475569] transition-colors hover:bg-[#F8FAFC] disabled:opacity-60"
          >
            Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}
