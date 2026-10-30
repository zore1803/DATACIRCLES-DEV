import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Pencil,
  CheckCircle,
  X,
  Plus,
  Trash2,
  Handshake,
  Building2,
  User,
  Package,
  Wallet,
  Receipt,
  FileText,
  CheckSquare,
  CalendarDays,
  StickyNote,
  UserCog,
  Store,
  Landmark,
  CreditCard,
  ShoppingCart,
  ClipboardList,
  Folder,
  Phone,
  Bell,
} from "lucide-react";
import BellIcon from "./common/BellIcon";
import API from "../services/api";
import useBodyScrollLock from "../hooks/useBodyScrollLock";

/*
 * Notification bell + activity feed dropdown.
 *
 * Backed by the real feed at /notification/feed, which the backend populates
 * automatically for every create / update / delete performed in the app (see
 * backend/utils/changeNotifier.js). This component just renders that feed,
 * tracks unread count, and marks everything read when the panel is opened.
 *
 * The unread count is polled on an interval so the badge updates without a page
 * reload when teammates make changes.
 */

const POLL_MS = 15000;

// Colour of the entity icon follows the action: green = added, blue = edited,
// red = removed. The small badge on the icon repeats the action as a glyph.
const actionStyle = {
  created: { Badge: Plus, cls: "bg-[#E7F7EE] text-[#12B76A]", badge: "bg-[#12B76A]" },
  updated: { Badge: Pencil, cls: "bg-[#EAF3FF] text-[#0085FF]", badge: "bg-[#0085FF]" },
  deleted: { Badge: Trash2, cls: "bg-[#FDECEC] text-[#DF120B]", badge: "bg-[#DF120B]" },
};

// One icon per kind of record, matched on the entity type's name. Order
// matters: the first match wins, so specific names come before general ones.
const ENTITY_ICONS = [
  [/staff|invit|user/i, UserCog],
  [/deal/i, Handshake],
  [/compan|organi/i, Building2],
  [/contact|customer|lead/i, User],
  [/vendor|supplier/i, Store],
  [/item|product|stock/i, Package],
  [/payment|wallet|expense|journal|transaction|refund/i, Wallet],
  [/bank/i, Landmark],
  [/subscription|billing|plan|coupon/i, CreditCard],
  [/invoice|quotation|proforma|challenge|delivery|credit|return|receipt/i, Receipt],
  [/purchase|order/i, ShoppingCart],
  [/task/i, CheckSquare],
  [/meeting|calendar/i, CalendarDays],
  [/note/i, StickyNote],
  [/call/i, Phone],
  [/form|submission/i, ClipboardList],
  [/folder|document/i, Folder],
  [/template|file/i, FileText],
];
const iconForEntity = (type) =>
  (ENTITY_ICONS.find(([re]) => re.test(type || "")) || [null, Bell])[1];

const timeOfDay = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
};

// Section heading for the day a notification landed on: Today / Yesterday /
// the full date.
const dayLabel = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Earlier";
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
};

const VERB = { created: "created", updated: "updated", deleted: "deleted" };

const changeOf = (n, re) => (n.changes || []).find((c) => re.test(c.field || ""));
const isCancelled = (n) => {
  const status = changeOf(n, /^status$/i);
  return !!status && /cancel/i.test(String(status.value));
};

// Short header: only says what happened ("A deal was created"). The record's
// name goes in the description below.
const titleFor = (n) => {
  const type = n.entityType || "Item";
  const lower = type.toLowerCase();
  const article = /^[aeiou]/.test(lower) ? "An" : "A";
  const plural = /s$/i.test(type) && !/ss$/i.test(type);

  // Business events that read better than a bare "created / updated".
  if (n.action === "created" && /payment/i.test(type)) return "A payment was made";
  if (n.action === "updated" && /payment|invoice|subscription/i.test(type) && isCancelled(n)) {
    return `${article} ${lower} was cancelled`;
  }
  if (/staff member/i.test(type) && n.action === "updated") {
    const role = changeOf(n, /^role$/i);
    if (role) return /admin/i.test(String(role.value)) ? "A staff member was upgraded" : "A staff member's role was changed";
    return "A staff member's access was changed";
  }
  if (/staff invitation/i.test(type)) {
    return n.action === "deleted" ? "A staff invitation was withdrawn" : "A staff member was invited";
  }
  if (/staff member/i.test(type)) {
    return n.action === "deleted" ? "A staff member was removed" : "A staff member was added";
  }

  const verb = VERB[n.action] || "updated";
  if (plural) return `${type} were ${verb}`;
  return `${article} ${lower} was ${verb}`;
};

// Longer (up to two lines) description: which record, who did it and, for
// updates, what changed.
const describe = (n) => {
  const type = (n.entityType || "item").toLowerCase();
  const name = n.entityLabel ? `${type} "${n.entityLabel}"` : `the ${type}`;
  const by = n.actorName ? ` by ${n.actorName}` : "";
  if (n.action === "created") {
    if (/payment/i.test(type)) return `A new ${name} was recorded in your workspace${by}.`;
    if (/staff member/i.test(type)) return `${n.entityLabel || "A new member"} was added to your team${by}.`;
    if (/staff invitation/i.test(type)) return `An invitation was sent to ${n.entityLabel || "a new member"}${by}.`;
    return `A new ${name} was added to your workspace${by}.`;
  }
  if (n.action === "deleted") {
    if (/staff member/i.test(type)) return `${n.entityLabel || "A member"} was removed from your team${by}.`;
    return `The ${name === `the ${type}` ? type : name} was permanently removed from your workspace${by}.`;
  }
  if (n.action === "updated") {
    if (isCancelled(n)) return `The ${name === `the ${type}` ? type : name} was marked as cancelled${by}.`;
    const role = changeOf(n, /^role$/i);
    if (role && /staff member/i.test(type)) {
      return `${n.entityLabel || "A member"} now has the ${String(role.value)} role${by}.`;
    }
    const fields = (n.changes || []).map((c) => c.field).filter(Boolean);
    if (fields.length > 0) {
      const shown = fields.slice(0, 4).join(", ");
      const extra = fields.length > 4 ? ` and ${fields.length - 4} more` : "";
      return `${shown}${extra} ${fields.length === 1 ? "was" : "were"} changed on ${name}${by}.`;
    }
    return `Details of ${name} were updated${by}.`;
  }
  return "";
};

const NotificationBell = ({ variant = "desktop" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("unread"); // "unread" | "all" — opens on Unread
  const wrapRef = useRef(null);
  useBodyScrollLock(isOpen);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await API.get("/notification/feed/unread-count");
      setUnread(res.data?.unreadCount || 0);
    } catch {
      /* silent — bell just won't show a badge */
    }
  }, []);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get("/notification/feed", { params: { limit: 40 } });
      setItems(res.data?.items || []);
      setUnread(res.data?.unreadCount || 0);
    } catch (err) {
      console.error("Failed to load notifications:", err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll the unread count in the background, and refresh when the tab/window
  // regains focus so a change the user just made shows up promptly.
  useEffect(() => {
    fetchUnread();
    const id = setInterval(fetchUnread, POLL_MS);
    const onFocus = () => fetchUnread();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchUnread]);

  // Close on Escape. Click-outside is handled by the backdrop's onClick — we
  // must NOT use a document mousedown listener here, because the panel is
  // portaled onto document.body (outside wrapRef), so clicks inside it (the
  // Unread tab, a notification) would be seen as "outside" and close the panel.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => e.key === "Escape" && setIsOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen]);

  const toggleOpen = async () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) {
      // Just load the feed — notifications are marked read individually when the
      // user clicks them, so the Unread tab stays meaningful across opens.
      await fetchFeed();
    }
  };

  // Mark a single notification read (on click) and update local state so it
  // moves out of the Unread tab and the badge count drops immediately.
  const markOneRead = async (n) => {
    if (n.read) return;
    setItems((prev) =>
      prev.map((i) => (i._id === n._id ? { ...i, read: true } : i))
    );
    setUnread((c) => Math.max(0, c - 1));
    try {
      await API.put(`/notification/feed/${n._id}/read`);
    } catch {
      /* non-fatal — local state already updated */
    }
  };

  const markAllRead = async () => {
    if (unreadInList === 0) return;
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    setUnread(0);
    try {
      await API.put("/notification/feed/read-all");
    } catch {
      /* non-fatal */
    }
  };

  const unreadInList = items.filter((n) => !n.read).length;
  const visibleItems =
    filter === "unread" ? items.filter((n) => !n.read) : items;

  const isMobile = variant === "mobile";
  // White fill on both variants: the header chrome is tinted, so the icon
  // buttons read as raised controls sitting on it rather than dissolving into
  // the tint.
  const buttonClass = isMobile
    ? "relative flex items-center justify-center w-8 h-8 bg-white border border-[#E1E4EA] rounded-full flex-shrink-0"
    : "relative flex items-center justify-center w-9 h-9 bg-white rounded-full border border-gray-300 hover:bg-gray-50 transition-colors";

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={toggleOpen}
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={isOpen}
        className={buttonClass}
      >
        <BellIcon className="w-4 h-4 text-[#111827]" />
        {unread > 0 && (
          <span
            className={`absolute rounded-full bg-[#DF120B] text-white text-[9px] font-semibold flex items-center justify-center ${
              isMobile
                ? "top-0 right-0.5 min-w-[13px] h-[13px] px-[3px]"
                : "-top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1"
            }`}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {isOpen && createPortal(
        <>
          {/* Backdrop dims the whole app; click to dismiss the drawer.
              Rendered via a portal on document.body so it escapes the header's
              stacking context and its z-index covers the sidebar + pagination. */}
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000]"
            onClick={() => setIsOpen(false)}
          />

          {/* Inset rounded card (same treatment as the filter panel): 1/3 width
              on desktop, with top/bottom/right insets and rounded corners. */}
          <aside
            className="fixed dc-panel-card dc-panel-w bg-white shadow-2xl z-[10001] flex flex-col overflow-hidden animate-slideInRight"
            role="dialog"
            aria-label="Notifications"
          >
            {/* Header row: title + All/Unread switcher + close. */}
            <div className="flex items-center gap-3 px-5 h-16 flex-shrink-0 border-b border-gray-100">
              <div className="flex flex-col flex-shrink-0">
                <span className="text-base font-semibold text-gray-900">
                  Notifications
                </span>
                {unreadInList > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="text-xs font-medium text-[#0085FF] hover:underline self-start"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              {/* Sliding switch: two equal columns, with a white pill that glides
                  between them (its width is one column, so 100% = one step). */}
              <div className="relative grid grid-cols-2 p-1 bg-gray-100 rounded-full ml-auto">
                <span
                  aria-hidden="true"
                  className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full bg-white shadow-sm transition-transform duration-300 ease-out pointer-events-none"
                  style={{ transform: filter === "all" ? "translateX(100%)" : "translateX(0)" }}
                />
                {[
                  { key: "unread", label: `Unread${unreadInList ? ` (${unreadInList})` : ""}` },
                  { key: "all", label: "All" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setFilter(tab.key)}
                    className={`relative z-10 px-4 py-1 text-sm font-medium rounded-full whitespace-nowrap transition-colors duration-300 ${
                      filter === tab.key
                        ? "text-gray-900"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close"
                className="flex items-center justify-center w-8 h-8 flex-shrink-0 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="px-4 py-10 text-center text-sm text-gray-400">Loading…</div>
              ) : visibleItems.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
                  <CheckCircle className="w-9 h-9 text-gray-300" />
                  <span className="text-sm text-gray-500">
                    {filter === "unread" ? "No unread notifications" : "No notifications yet"}
                  </span>
                  <span className="text-xs text-gray-400">
                    Changes across your workspace will show up here.
                  </span>
                </div>
              ) : (
                <div className="px-4 pb-4">
                  {visibleItems.map((n, idx) => {
                    const style = actionStyle[n.action] || actionStyle.updated;
                    const Icon = iconForEntity(n.entityType);
                    const Badge = style.Badge;
                    const day = dayLabel(n.createdAt);
                    const showDay = idx === 0 || dayLabel(visibleItems[idx - 1].createdAt) !== day;
                    const description = describe(n);
                    return (
                      <div key={n._id}>
                        {showDay && (
                          <p className="px-1 pt-4 pb-2 text-xs font-medium text-gray-400">{day}</p>
                        )}
                        <div
                          onClick={() => markOneRead(n)}
                          className={`flex items-start gap-3 px-4 py-3 mb-2 rounded-2xl border transition-colors ${
                            n.read
                              ? "bg-white border-gray-100 hover:bg-gray-50"
                              : "bg-[#F5FAFF] border-[#DCEBFF] hover:bg-[#EAF3FF] cursor-pointer"
                          }`}
                        >
                          <div
                            className={`relative flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0 ${style.cls}`}
                          >
                            <Icon className="w-5 h-5" />
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 flex items-center justify-center w-4 h-4 rounded-full border-2 border-white text-white ${style.badge}`}
                            >
                              <Badge className="w-2.5 h-2.5" strokeWidth={3} />
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <p
                                className={`text-sm text-gray-900 truncate ${
                                  n.read ? "font-medium" : "font-semibold"
                                }`}
                              >
                                {titleFor(n)}
                              </p>
                              <span className="text-[11px] text-gray-400 flex-shrink-0 mt-0.5">
                                {timeOfDay(n.createdAt)}
                              </span>
                            </div>
                            <div className="flex items-end justify-between gap-3 mt-0.5">
                              <p className="text-xs text-gray-500 leading-snug line-clamp-2">
                                {description}
                              </p>
                              {!n.read && (
                                <span
                                  className="w-2.5 h-2.5 mb-0.5 rounded-full bg-[#0085FF] flex-shrink-0"
                                  title="Unread"
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </>,
        document.body
      )}
    </div>
  );
};

export default NotificationBell;
