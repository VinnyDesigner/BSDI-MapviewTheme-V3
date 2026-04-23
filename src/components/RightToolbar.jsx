import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './RightToolbar.css';

const RightToolbar = ({ pinnedTools, getToolIcon, onRestore }) => {
  return (
    <div className="right-toolbar-container">
      <AnimatePresence>
        {pinnedTools.map((toolId, index) => (
          <motion.button
            key={toolId}
            className="pinned-tool-button"
            initial={{ x: 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 60, opacity: 0 }}
            transition={{ 
              type: 'spring', 
              damping: 20, 
              stiffness: 200,
              delay: index * 0.05 
            }}
            onClick={() => onRestore(toolId)}
            title={toolId.charAt(0).toUpperCase() + toolId.slice(1)}
          >
            {getToolIcon(toolId)}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default RightToolbar;
