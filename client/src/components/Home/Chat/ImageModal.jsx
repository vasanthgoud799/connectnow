import React from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

function ImageModal({ isOpen, onClose, imageUrl }) {
  if (!isOpen) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/10 bg-[#0b1120] shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
      >
        <button
          type="button"
          className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white transition hover:bg-black/60"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-center justify-center p-4">
          <img
            src={imageUrl}
            alt="Preview"
            className="max-h-[82vh] w-auto rounded-[20px] object-contain"
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

export default ImageModal;
