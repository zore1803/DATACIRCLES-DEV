import { useEffect } from "react";
import { WifiOff } from "lucide-react";
import useOnlineStatus from "../../hooks/useOnlineStatus";
import { setTopBarHeight } from "../../utils/topBars";

// The banner height App.jsx pushes the fixed header/sidebar down by while
// this is showing — keep this and the h-9 class below in sync.
export const OFFLINE_BANNER_HEIGHT = 36;

// Persistent banner while the browser has no network connection. Without
// this, going offline was invisible until some unrelated request failed —
// api.js's retry logic would quietly retry twice and give up, and whatever
// called it either showed its own toast or (like Profile) sat on a loading
// skeleton forever with no explanation.
//
// Fixed (not just relatively positioned) so it stays pinned to the viewport
// top instead of scrolling away with the page.
const OfflineBanner = () => {
  const isOnline = useOnlineStatus();

  // Fixed headers/sidebar (Header.jsx, Navbar.jsx) and the page's own top
  // padding read this CSS variable to make room for the banner, instead of
  // this component reaching into their markup directly.
  // The shared helper adds this to the profile checklist bar's height (when both show).
  useEffect(() => {
    setTopBarHeight("offline", isOnline ? 0 : OFFLINE_BANNER_HEIGHT);
    return () => setTopBarHeight("offline", 0);
  }, [isOnline]);

  if (isOnline) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 h-9 bg-red-600 text-white px-4 flex items-center justify-center gap-2 text-sm font-medium z-[100020]"
    >
      <WifiOff className="w-4 h-4 flex-shrink-0" />
      <span>You're offline. Changes may not be saved until you're back online.</span>
    </div>
  );
};

export default OfflineBanner;
