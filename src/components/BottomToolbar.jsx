import React, { useRef, useState, useEffect } from 'react';
import { 
  Layers, 
  Info, 
  Search, 
  Navigation, 
  Ruler, 
  Pencil, 
  Box, 
  Database, 
  Globe, 
  Printer, 
  Bookmark 
} from 'lucide-react';
import { motion } from 'framer-motion';
import './BottomToolbar.css';

const TOOL_GROUPS = [
  {
    name: 'Explore',
    tools: [
      { id: 'layers', name: 'Layers', icon: Layers },
      { id: 'search', name: 'Search', icon: Search },
      { id: 'navigation', name: 'Navigation', icon: Navigation }
    ]
  },
  {
    name: 'Analysis',
    tools: [
      { id: 'measure', name: 'Measure', icon: Ruler },
      { id: 'draw', name: 'Draw', icon: Pencil },
      { id: 'cad', name: 'CAD', icon: Box }
    ]
  },
  {
    name: 'Data',
    tools: [
      { id: 'data_request', name: 'Data Request', icon: Database },
      { id: 'external_data', name: 'External Data', icon: Globe }
    ]
  },
  {
    name: 'Output',
    tools: [
      { id: 'print', name: 'Print', icon: Printer },
      { id: 'bookmark', name: 'Bookmark', icon: Bookmark }
    ]
  }
];

const BottomToolbar = ({ activeTool, onToolSelect }) => {
  const toolbarRef = useRef(null);
  const [notchX, setNotchX] = useState(0);

  // Get all tool IDs that belong to this toolbar
  const bottomToolIds = TOOL_GROUPS.flatMap(group => group.tools.map(t => t.id));
  const isBottomToolActive = activeTool && bottomToolIds.includes(activeTool);

  useEffect(() => {
    if (toolbarRef.current && isBottomToolActive) {
      const activeBtn = toolbarRef.current.querySelector('.tool-button.active');
      if (activeBtn) {
        const btnRect = activeBtn.getBoundingClientRect();
        const toolbarRect = toolbarRef.current.getBoundingClientRect();
        const x = (btnRect.left - toolbarRect.left) + (btnRect.width / 2);
        setNotchX(x);
      }
    }
  }, [activeTool, isBottomToolActive]);

  return (
    <div className="bottom-toolbar-container">
      <motion.div 
        ref={toolbarRef}
        className={`toolbar-wrapper ${isBottomToolActive ? 'has-active-tool' : ''}`}
        initial={{ y: 100, opacity: 0 }}
        animate={{ 
          y: 0, 
          opacity: 1,
          '--notch-x': `${notchX}px`
        }}
        transition={{ type: 'spring', damping: 20, stiffness: 100 }}
      >
        {TOOL_GROUPS.map((group, groupIndex) => (
          <React.Fragment key={group.name}>
            <div className="tool-group">
              {group.tools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.id}
                    className={`tool-button ${activeTool === tool.id ? 'active' : ''}`}
                    onClick={() => onToolSelect(tool.id)}
                    data-tooltip={tool.name}
                    aria-label={tool.name}
                  >
                    <Icon size={18} />
                  </button>
                );
              })}
            </div>
            {groupIndex < TOOL_GROUPS.length - 1 && (
              <div className="toolbar-divider" />
            )}
          </React.Fragment>
        ))}
      </motion.div>
    </div>
  );
};

export default BottomToolbar;
