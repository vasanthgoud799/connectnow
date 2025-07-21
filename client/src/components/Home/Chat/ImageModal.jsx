// src/components/ImageModal.jsx
import React from "react";
import { motion } from "framer-motion"; // Import framer-motion for animations

function ImageModal({ isOpen, onClose, imageUrl }) {
  if (!isOpen) return null;

  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50"
      initial={{ opacity: 0 }} // Initial opacity
      animate={{ opacity: 1 }} // Animate to full opacity
      exit={{ opacity: 0 }} // Animate back to opacity 0 on exit
      transition={{ duration: 0.3 }} // Transition duration
    >
      <motion.div
        className="bg-white rounded-lg shadow-lg overflow-hidden"
        initial={{ scale: 0.8 }} // Start scale at 0.8
        animate={{ scale: 1 }} // Animate to full scale
        exit={{ scale: 0.8 }} // Scale back down on exit
        transition={{ duration: 0.3 }} // Transition duration
      >
        <span
          className="absolute top-2 right-2 cursor-pointer text-lg"
          onClick={onClose}
        >
          ✖️
        </span>
        <div className="w-[90%] max-w-[400px] h-[300px] mx-auto overflow-hidden">
          <img
            src={imageUrl}
            alt="Profile"
            className="w-full h-full object-cover" // Use object-cover to maintain aspect ratio
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

export default ImageModal;
