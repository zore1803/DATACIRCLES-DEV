// Fixed bars pinned above the app header (today only the offline banner) reserve some height.
// Header/Navbar/page content already read ONE CSS variable, --dc-offline-offset, to make room, so
// this keeps that variable equal to the bar's height while it shows, and also publishes it as
// --dc-topbar-offline for any bar that needs to stack beneath it.
const heights = { offline: 0 };

export function setTopBarHeight(name, px) {
  heights[name] = px;
  const total = Object.values(heights).reduce((sum, h) => sum + h, 0);
  const root = document.documentElement.style;
  root.setProperty("--dc-topbar-offline", `${heights.offline}px`);
  root.setProperty("--dc-offline-offset", `${total}px`);
}
