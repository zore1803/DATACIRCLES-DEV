import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import confetti from "canvas-confetti";

export default function SuccessModal({ isOpen, title = "Invoice Created Successfully!", message, onClose }) {

  // Toggle body class — CSS uses it to blur/dim sidebar + header
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add("success-modal-open");
    } else {
      document.body.classList.remove("success-modal-open");
    }
    return () => document.body.classList.remove("success-modal-open");
  }, [isOpen]);

  // Confetti in brand blue tones
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => {
      confetti({
        particleCount: 80,
        spread: 65,
        origin: { y: 0.55 },
        colors: ["#0085FF", "#0C4FCD", "#60a5fa", "#bfdbfe", "#ffffff"],
        zIndex: 999999,
      });
    }, 320);
    return () => clearTimeout(t);
  }, [isOpen]);

  const handleClose = () => {
    document.body.classList.remove("success-modal-open");
    onClose();
  };

  let portal = document.getElementById("success-modal-portal");
  if (!portal) {
    portal = document.createElement("div");
    portal.id = "success-modal-portal";
    portal.style.cssText = "position:fixed;inset:0;z-index:999999;pointer-events:none;";
    document.body.appendChild(portal);
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="dc-success-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ pointerEvents: "auto" }}
          className="fixed inset-0 z-[999999] flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <motion.div
            key="dc-success-card"
            initial={{ scale: 0.84, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 10, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 28, mass: 0.85 }}
            className="relative bg-white rounded-2xl overflow-hidden w-full max-w-sm mx-4"
            style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,133,255,0.12)" }}
          >
            {/* Brand blue top accent bar */}
            <div style={{ height: 4, background: "linear-gradient(90deg,#0085FF,#0C4FCD)" }} />

            <div className="px-7 pt-7 pb-3">
              {/* Animated blue tick circle */}
              <div className="flex justify-center mb-5">
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 340, damping: 20, delay: 0.08 }}
                  className="relative flex items-center justify-center"
                  style={{
                    width: 64, height: 64, borderRadius: "50%",
                    background: "linear-gradient(135deg,#0085FF,#0C4FCD)",
                    boxShadow: "0 6px 24px rgba(0,133,255,0.4)",
                  }}
                >
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{ border: "2px solid #0085FF" }}
                    initial={{ scale: 1, opacity: 0.7 }}
                    animate={{ scale: 1.65, opacity: 0 }}
                    transition={{ duration: 0.75, delay: 0.28, ease: "easeOut" }}
                  />
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <motion.path
                      d="M8 17l6 6 10-12"
                      stroke="white"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 0.42, delay: 0.22, ease: "easeOut" }}
                    />
                  </svg>
                </motion.div>
              </div>

              <motion.h2
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.32, duration: 0.28 }}
                style={{ textAlign: "center", fontSize: 16, fontWeight: 700, color: "#1F2937", fontFamily: "Inter,sans-serif", lineHeight: 1.35 }}
              >
                {title}
              </motion.h2>

              {message && (
                <motion.p
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.42, duration: 0.25 }}
                  style={{ textAlign: "center", fontSize: 13, color: "#525866", fontFamily: "Inter,sans-serif", marginTop: 6 }}
                >
                  {message}
                </motion.p>
              )}
            </div>

            <div style={{ padding: "16px 28px 24px" }}>
              <motion.button
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.48, duration: 0.22 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleClose}
                style={{
                  width: "100%", padding: "10px 0", borderRadius: 12, border: "none",
                  background: "linear-gradient(135deg,#0085FF,#0C4FCD)",
                  color: "#fff", fontSize: 14, fontWeight: 600,
                  fontFamily: "Inter,sans-serif", cursor: "pointer",
                  boxShadow: "0 3px 12px rgba(0,133,255,0.35)",
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 5px 20px rgba(0,133,255,0.5)"; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 3px 12px rgba(0,133,255,0.35)"; }}
              >
                Done
              </motion.button>
            </div>

            <button
              onClick={handleClose}
              style={{
                position: "absolute", top: 14, right: 14,
                background: "none", border: "none", cursor: "pointer",
                color: "#99A0AE", padding: 6, borderRadius: 8,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#F0F6FF"; e.currentTarget.style.color = "#0085FF"; }}
              onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "#99A0AE"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    portal
  );
}