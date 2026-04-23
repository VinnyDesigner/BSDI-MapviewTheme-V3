import React from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './FloatingPanel.css';

const FloatingPanel = ({ isOpen, title, children, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="floating-panel-container">
          <motion.div 
            className="floating-panel"
            initial={{ y: 20, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          >
            <div className="floating-panel-header">
              <h3>{title}</h3>
              <button className="close-button" onClick={onClose} aria-label="Close panel">
                <X size={18} />
              </button>
            </div>
            <div className="floating-panel-content">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default FloatingPanel;
