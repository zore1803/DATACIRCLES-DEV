import { useEffect, useRef, useState } from "react";

// A horizontally scrolling board (Kanban columns) whose scrollbar is always reachable.
//
// A board whose columns grow to their full height has its own scrollbar at the very bottom of the
// board, far below the visible screen, so the columns off to the right can't be reached without
// knowing a trackpad / shift+wheel gesture. The board's own bar stays hidden, and a thin proxy bar
// is pinned to the bottom of the viewport (position: sticky) and kept in sync with it, so sliding
// between columns works with a plain mouse at any scroll position. It only appears when the
// columns actually overflow.
export default function StickyScrollBoard({ children, className = "", style }) {
  const boardRef = useRef(null);
  const barRef = useRef(null);
  const [dims, setDims] = useState({ scroll: 0, client: 0 });

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return undefined;
    const measure = () => setDims({ scroll: board.scrollWidth, client: board.clientWidth });
    measure();
    // The board itself (window resized) and its content (a column added or removed) both change
    // how far there is to scroll.
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    if (board.firstElementChild) observer.observe(board.firstElementChild);
    return () => observer.disconnect();
  }, []);

  // Each bar mirrors the other. Writing scrollLeft fires the other's scroll event, so only write
  // when the position really differs, which stops the two from echoing forever.
  const mirror = (from, to) => {
    if (from && to && to.scrollLeft !== from.scrollLeft) to.scrollLeft = from.scrollLeft;
  };

  const overflowing = dims.scroll > dims.client + 1;

  return (
    <>
      <div
        ref={boardRef}
        onScroll={() => mirror(boardRef.current, barRef.current)}
        className={`overflow-x-auto scrollbar-hide ${className}`}
        style={style}
      >
        {children}
      </div>
      {overflowing && (
        <div
          ref={barRef}
          onScroll={() => mirror(barRef.current, boardRef.current)}
          className={`sticky bottom-0 z-30 overflow-x-auto overflow-y-hidden border-t border-[#E1E4EA] bg-white/95 ${className}`}
          style={{ height: 16 }}
          aria-hidden="true"
        >
          <div style={{ width: dims.scroll, height: 1 }} />
        </div>
      )}
    </>
  );
}
