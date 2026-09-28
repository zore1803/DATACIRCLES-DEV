import React, { useEffect } from "react";
import { PackageX } from "lucide-react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

const parseItemName = (message) => {
  const match = /Insufficient stock for (?:variant of: )?(.+)$/i.exec(message || "");
  return match ? match[1].trim() : null;
};

const InsufficientStockDialog = ({ isOpen, message, onClose }) => {
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add("error-modal-open");
    } else {
      document.body.classList.remove("error-modal-open");
    }
    return () => document.body.classList.remove("error-modal-open");
  }, [isOpen]);

  const handleClose = () => {
    document.body.classList.remove("error-modal-open");
    if (onClose) onClose();
  };

  const itemName = parseItemName(message);

  let portal = document.getElementById("error-modal-portal");
  if (!portal && typeof document !== "undefined") {
    portal = document.createElement("div");
    portal.id = "error-modal-portal";
    portal.style.cssText = "position:fixed;inset:0;z-index:999999;pointer-events:none;";
    document.body.appendChild(portal);
  }

  if (!portal) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="dc-error-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ pointerEvents: "auto" }}
          className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <motion.div
            key="dc-error-card"
            initial={{ scale: 0.84, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 10, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 28, mass: 0.85 }}
            className="relative bg-white rounded-2xl overflow-hidden w-full max-w-sm mx-4"
            style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(239,68,68,0.12)" }}
          >
            {/* Brand red top accent bar */}
            <div style={{ height: 4, background: "linear-gradient(90deg,#EF4444,#DC2626)" }} />

            <div className="px-7 pt-7 pb-3">
              {/* Animated red icon circle */}
              <div className="flex justify-center mb-5">
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 340, damping: 20, delay: 0.08 }}
                  className="relative flex items-center justify-center"
                  style={{
                    width: 64, height: 64, borderRadius: "50%",
                    background: "linear-gradient(135deg,#EF4444,#DC2626)",
                    boxShadow: "0 6px 24px rgba(239,68,68,0.4)",
                  }}
                >
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{ border: "2px solid #EF4444" }}
                    initial={{ scale: 1, opacity: 0.7 }}
                    animate={{ scale: 1.65, opacity: 0 }}
                    transition={{ duration: 0.75, delay: 0.28, ease: "easeOut" }}
                  />
                  <PackageX color="white" size={32} />
                </motion.div>
              </div>

              <motion.h2
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.32, duration: 0.28 }}
                style={{ textAlign: "center", fontSize: 16, fontWeight: 700, color: "#1F2937", fontFamily: "Inter,sans-serif", lineHeight: 1.35 }}
              >
                Insufficient Stock
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.42, duration: 0.25 }}
                style={{ textAlign: "center", fontSize: 13, color: "#525866", fontFamily: "Inter,sans-serif", marginTop: 6 }}
              >
                {itemName ? (
                  <>
                    <strong style={{ color: "#1F2937", fontWeight: 600 }}>{itemName}</strong> doesn't have
                    enough stock to cover the quantity on this document.
                  </>
                ) : (
                  message || "One or more items don't have enough stock to cover the quantity on this document."
                )}
                <br style={{ display: "block", content: '""', marginTop: 4 }} />
                Reduce the quantity or restock the item, then try again.
              </motion.p>
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
                  background: "linear-gradient(135deg,#EF4444,#DC2626)",
                  color: "#fff", fontSize: 14, fontWeight: 600,
                  fontFamily: "Inter,sans-serif", cursor: "pointer",
                  boxShadow: "0 3px 12px rgba(239,68,68,0.35)",
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 5px 20px rgba(239,68,68,0.5)"; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 3px 12px rgba(239,68,68,0.35)"; }}
              >
                Got it
              </motion.button>
            </div>

            <button
              onClick={handleClose}
              style={{
                position: "absolute", top: 14, right: 14,
                background: "none", border: "none", cursor: "pointer",
                color: "#99A0AE", padding: 6, borderRadius: 8,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#FEF2F2"; e.currentTarget.style.color = "#EF4444"; }}
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
};

export default InsufficientStockDialog;
