import React, { useRef, useState, useEffect } from 'react';
import { 
  Layers, Info, Search, Navigation, Ruler, 
  Pencil, Box, Database, Globe, Printer, Bookmark,
  Columns2, Map
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '../context/LanguageContext';
import { translations } from '../i18n/translations';
import './BottomToolbar.css';

// Tool group structure — IDs are code keys, names resolved via translations
const TOOL_GROUP_DEFS = [
  {
    id: 'explore',
    tools: [
      { id: 'layers',     icon: Layers },
      { id: 'search',     icon: Search },
      { id: 'split',      icon: Columns2 },
      { id: 'navigation', icon: Navigation },
    ]
  },
  {
    id: 'analysis',
    tools: [
      { id: 'measure', icon: Ruler },
      { id: 'draw',    icon: Pencil },
      { id: 'cad',     icon: Box },
    ]
  },
  {
    id: 'data',
    tools: [
      { id: 'data_request',  icon: Database },
      { id: 'external_data', icon: Globe },
    ]
  },
  {
    id: 'output',
    tools: [
      { id: 'print',    icon: Printer },
      { id: 'bookmark', icon: Bookmark },
    ]
  },
];

const BottomToolbar = ({ activeTool, onToolSelect }) => {
  const { lang } = useLanguage();
  const toolbarRef = useRef(null);
  const [notchX, setNotchX] = useState(0);

  const allToolIds = TOOL_GROUP_DEFS.flatMap(g => g.tools.map(t => t.id));
  const isBottomToolActive = activeTool && allToolIds.includes(activeTool);

  useEffect(() => {
    if (toolbarRef.current && isBottomToolActive) {
      const activeBtn = toolbarRef.current.querySelector('.tool-button.active');
      if (activeBtn) {
        const btnRect     = activeBtn.getBoundingClientRect();
        const toolbarRect = toolbarRef.current.getBoundingClientRect();
        setNotchX((btnRect.left - toolbarRect.left) + btnRect.width / 2);
      }
    }
  }, [activeTool, isBottomToolActive]);

  return (
    <div className="bottom-toolbar-container">
      <motion.div
        ref={toolbarRef}
        className={`toolbar-wrapper ${isBottomToolActive ? 'has-active-tool' : ''}`}
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1, '--notch-x': `${notchX}px` }}
        transition={{ type: 'spring', damping: 20, stiffness: 100 }}
      >
        {TOOL_GROUP_DEFS.map((group, groupIndex) => (
          <React.Fragment key={group.id}>
            <div className="tool-group">
              {group.tools.map((tool) => {
                const Icon = tool.icon;
                // ✅ Static UI tooltip from translations — NOT dynamic data
                const label = translations[lang].tools[tool.id] ?? tool.id;
                return (
                  <button
                    key={tool.id}
                    id={`toolbar-btn-${tool.id}`}
                    className={`tool-button ${activeTool === tool.id ? 'active' : ''}`}
                    onClick={() => onToolSelect(tool.id)}
                    data-tooltip={label}
                    aria-label={label}
                  >
                    <Icon size={18} />
                  </button>
                );
              })}
            </div>
            {groupIndex < TOOL_GROUP_DEFS.length - 1 && (
              <div className="toolbar-divider" />
            )}
          </React.Fragment>
        ))}
      </motion.div>
    </div>
  );
};

export default BottomToolbar;
