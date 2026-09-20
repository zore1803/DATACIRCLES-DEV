import DeleteIcon from "./common/DeleteIcon";
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Pencil, CheckCircle, X } from "lucide-react";
import PlusIcon from "./common/PlusIcon";
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

const actionStyle = {
  created: { Icon: PlusIcon, cls: "bg-[#E7F7EE] text-[#12B76A]" },
  updated: { Icon: Pencil, cls: "bg-[#EAF3FF] text-[#0085FF]" },
  deleted: { Icon: DeleteIcon, cls: "bg-[#FDECEC] text-[#DF120B]" },
};

const timeAgo = (iso) => {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  const s = Math.round(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
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

              <div className="inline-flex items-center gap-1 p-1 bg-gray-100 rounded-lg ml-auto">
                {[
                  { key: "unread", label: `Unread${unreadInList ? ` (${unreadInList})` : ""}` },
                  { key: "all", label: "All" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setFilter(tab.key)}
                    className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                      filter === tab.key
                        ? "bg-white text-gray-900 shadow-sm"
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
                visibleItems.map((n) => {
                  const style = actionStyle[n.action] || actionStyle.updated;
                  const Icon = style.Icon;
                  const fields = (n.changes || []).map((c) => c.field);
                  return (
                    <div
                      key={n._id}
                      onClick={() => markOneRead(n)}
                      className={`w-full flex items-start gap-3 px-5 py-4 border-b border-gray-50 last:border-b-0 transition-colors ${
                        n.read ? "hover:bg-gray-50" : "bg-[#F5FAFF] hover:bg-[#EAF3FF] cursor-pointer"
                      }`}
                    >
                      <div
                        className={`mt-0.5 flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 ${style.cls}`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm text-gray-900 ${
                            n.read ? "font-normal" : "font-semibold"
                          }`}
                        >
                          {n.message}
                        </p>
                        {fields.length > 0 && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            Changed: {fields.join(", ")}
                          </p>
                        )}
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {timeAgo(n.createdAt)}
                        </p>
                      </div>
                      {!n.read && (
                        <span className="mt-1.5 w-2 h-2 rounded-full bg-[#0085FF] flex-shrink-0" />
                      )}
                    </div>
                  );
                })
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
