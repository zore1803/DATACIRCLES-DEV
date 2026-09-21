import { useEffect } from "react";

// Paints <html>/<body> behind a full-screen page. The desktop zoom on <html>
// leaves a strip around an h-screen layout uncovered, so its own background
// alone shows white edges. Restores the previous values on unmount.
export default function usePageBackground(color) {
  useEffect(() => {
    const { documentElement: html, body } = document;
    const prev = [html.style.backgroundColor, body.style.backgroundColor];
    html.style.backgroundColor = color;
    body.style.backgroundColor = color;
    return () => {
      [html.style.backgroundColor, body.style.backgroundColor] = prev;
    };
  }, [color]);
}
