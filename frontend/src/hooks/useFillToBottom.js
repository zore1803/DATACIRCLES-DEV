import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// Floor so a very short window can't collapse the box to nothing.
const MIN_HEIGHT = 180;
// Cap the table at this fraction of the viewport height.
const VIEWPORT_FRACTION = 0.6;

// Caps a container at a fixed fraction of the viewport height so it never
// overflows/scrolls the page — a short list shrinks to its rows, a long one
// scrolls inside the cap. Deliberately position-independent (no rect.top math,
// which mis-measured with this app's stacked CSS `zoom` layers); only the total
// ancestor `zoom` is used, to convert the cap into the element's CSS px.
// Usage: const { containerRef, footerRef, style } = useFillToBottom();
export default function useFillToBottom() {
  const containerRef = useRef(null);
  const footerRef = useRef(null); // kept for call-site compatibility
  const [height, setHeight] = useState(null);

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    // Total zoom: walk the ancestor chain multiplying every `zoom` (this app
    // stacks #root 0.75 + a dynamic <html> zoom >=1024px; both read 1 otherwise).
    let scale = 1;
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const z = parseFloat(getComputedStyle(node).zoom);
      if (z && !Number.isNaN(z)) scale *= z;
    }
    setHeight(Math.max(MIN_HEIGHT, (window.innerHeight * VIEWPORT_FRACTION) / scale));
  }, []);

  useLayoutEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // The <html> zoom is applied from its own effect that may land after this one
  // on first paint, so re-measure next frame against the settled zoom.
  useEffect(() => {
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [measure]);

  return {
    containerRef,
    footerRef,
    // max-height, not height: caps the box so it never overflows the page while
    // a short list still shrinks to fit.
    style: height == null ? undefined : { maxHeight: `${height}px` },
  };
}
