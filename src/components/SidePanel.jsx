import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import React, { useState } from 'react';
import './SidePanel.css';

const SidePanel = ({ isOpen, title, children, onClose, onMinimize }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="side-panel-container">
          <motion.div 
            className="side-panel"
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: '0%', opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          >
            {/* Minimize Handle */}
            <button 
              className="side-panel-handle" 
              onClick={onMinimize}
              aria-label="Minimize panel"
            >
              <ChevronRight size={24} />
            </button>

            <div className="side-panel-inner">
              <div className="side-panel-glow" />
              <div className="side-panel-header">
                <h3>{title}</h3>
                <button className="close-button" onClick={onClose} aria-label="Close panel">
                  <X size={18} />
                </button>
              </div>
              <div className="side-panel-content">
                {children}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SidePanel;
