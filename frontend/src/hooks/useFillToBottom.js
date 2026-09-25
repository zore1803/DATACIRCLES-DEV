import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// Floor so a mis-measurement or very short window can't collapse the box.
const MIN_HEIGHT = 180;

// Caps a container at the remaining viewport space (minus an optional footer,
// e.g. a pagination bar, reserved below it) so a long list scrolls internally
// while a short list shrinks to its rows instead of leaving a gap below.
// Measured rather than a calc() constant because the height above the container
// varies with the KPI toggle, banners and the responsive KPI grid. Zoom is read
// off the elements (this app stacks #root 0.75 + a dynamic <html> zoom >=1024px).
// Usage: const { containerRef, footerRef, style } = useFillToBottom();
export default function useFillToBottom() {
  const containerRef = useRef(null);
  const footerRef = useRef(null);
  const [height, setHeight] = useState(null);

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    // Exact total zoom: walk the ancestor chain multiplying every `zoom`.
    // Same approach as getAncestorZoom() in pages/Companies.jsx.
    let scale = 1;
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const z = parseFloat(getComputedStyle(node).zoom);
      if (z && !Number.isNaN(z)) scale *= z;
    }

    const rect = el.getBoundingClientRect();

    // Browsers disagree on whether getBoundingClientRect() reports visual
    // (zoom-scaled) or layout coordinates — this codebase carries contradictory
    // comments about it, from either side of the change that standardised
    // `zoom`. Rather than assume, work out which one this browser is doing by
    // comparing the measured height against the computed (always CSS px) one.
    // When scale === 1 both branches agree, so this is a no-op without zoom.
    const cssHeight = parseFloat(getComputedStyle(el).height) || rect.height || 1;
    const rectToVisual =
      Math.abs(rect.height - cssHeight * scale) <= Math.abs(rect.height - cssHeight)
        ? 1
        : scale;

    // The footer sits OUTSIDE the container, so both its height and the gap
    // between the two (its top margin) have to be reserved. The gap is a fixed
    // margin — it doesn't move when the container's height changes — so reading
    // it here is stable rather than circular.
    let footerReserve = 0;
    if (footerRef.current) {
      const footerRect = footerRef.current.getBoundingClientRect();
      const gap = Math.max(0, footerRect.top - rect.bottom);
      footerReserve = (footerRect.height + gap) * rectToVisual;
    }

    // Space left on screen below the container's top edge, in visual px...
    const availableVisual =
      window.innerHeight - rect.top * rectToVisual - footerReserve;
    // ...converted back into the CSS px that `height` is expressed in.
    setHeight(Math.max(MIN_HEIGHT, availableVisual / scale));
  }, []);

  useLayoutEffect(() => {
    measure();

    // Observing <body> catches everything that shifts the container's top
    // without a window resize: the KPI toggle, the admin-notice banner, a
    // wrapped address, fonts finishing loading.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    if (containerRef.current?.parentElement) {
      observer.observe(containerRef.current.parentElement);
    }
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // The zoom in App.jsx is applied from its own effect, which may land after
  // this one on first paint. Re-measure once on the next frame so the initial
  // height isn't computed against a stale zoom.
  useEffect(() => {
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [measure]);

  return {
    containerRef,
    footerRef,
    // max-height, not height: a short list shrinks to fit (no trailing gap),
    // a long one caps here and scrolls internally.
    style: height == null ? undefined : { maxHeight: `${height}px` },
  };
}
