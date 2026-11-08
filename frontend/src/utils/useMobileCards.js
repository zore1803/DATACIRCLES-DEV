import { useEffect, useState } from "react";
import { isNativeApp } from "./isNativeApp";

// True only inside the mobile app (WebView) on a phone-width screen — lists
// switch to cards with 15 per page. The website always keeps its tables.
export const MOBILE_CARD_PAGE_SIZE = 15;

export default function useMobileCards() {
  const [on, setOn] = useState(() => isNativeApp && window.innerWidth < 1024);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023.98px)");
    const update = () => setOn(isNativeApp && mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return on;
}
