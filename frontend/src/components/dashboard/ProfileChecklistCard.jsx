import { Link } from "react-router-dom";
import { useProfileChecklist } from "../../contexts/ProfileChecklistContext";

// The same checklist as the top bar, as a card at the head of the Dashboard. Shows only what is
// still missing, each as a link to where it's filled in. Renders nothing once the profile is
// complete enough (see CHECKLIST_VISIBLE_BELOW_PERCENT).
export default function ProfileChecklistCard() {
  const { data, visible } = useProfileChecklist();
  if (!visible) return null;

  const { items, completed, total, percent } = data;
  const remaining = items.filter((item) => !item.done);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[#E1E4EA] bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0 lg:w-[320px] lg:flex-shrink-0">
        <p className="font-['Inter'] text-[14px] font-semibold text-[#0F172A]">Complete your profile</p>
        <p className="font-['Inter'] text-[12px] text-[#64748B]">
          {completed}/{total} &middot; {percent}% done
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
          <div className="h-full rounded-full bg-[#0085FF] transition-all duration-300" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
        <span className="font-['Inter'] text-[12px] text-[#64748B]">Still to do:</span>
        {remaining.map((item) => (
          <Link
            key={item.key}
            to={item.link}
            className="rounded-full border border-[#E2E8F0] bg-white px-3 py-1.5 font-['Inter'] text-[12px] font-medium text-[#0085FF] transition-colors hover:border-[#0085FF] hover:bg-[#EAF4FF]"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
