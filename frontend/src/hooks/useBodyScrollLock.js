import { useEffect } from "react";

// Locks the page behind a modal/side-panel from scrolling while it's open —
// only the card/panel's own internal scroll container should move. Call
// with the modal's own `isOpen` boolean; safe to call unconditionally
// (locks/unlocks nothing when isOpen is false).
//
// Reference-counted via a shared counter on <html>, not a plain "restore my
// own snapshot" toggle: two overlays can be open at once (e.g. a confirm
// dialog opened from inside a side-panel), and the first one to close must
// not re-enable scrolling while the second is still up. Each mount/unmount
// increments/decrements the counter; the lock only lifts at zero.
let lockCount = 0;

export default function useBodyScrollLock(isOpen) {
  useEffect(() => {
    if (!isOpen) return;

    lockCount += 1;
    if (lockCount === 1) {
      document.documentElement.style.overflow = "hidden";
    }

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        document.documentElement.style.overflow = "";
      }
    };
  }, [isOpen]);
}
