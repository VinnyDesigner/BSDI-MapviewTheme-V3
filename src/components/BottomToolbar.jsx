import React, { useRef, useState, useEffect } from 'react';
import { 
  Layers, Info, Search, Navigation, Ruler, 
  Pencil, Box, Database, Globe, Printer, Bookmark,
  Columns2, Map, Blend
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
      { id: 'split_view', icon: Map },
      { id: 'blend',      icon: Blend },
      { id: 'arcade',     icon: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H7" />
        </svg>
      )},
      { id: 'spatial_analysis', icon: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
          <path d="M22 12A10 10 0 0 0 12 2v10z" />
        </svg>
      )},
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

const BottomToolbar = ({ 
  activeTool, 
  onToolSelect, 
  swipeMode = 'vertical', 
  isSplitView = false,
  isSplitModePersistent = false 
}) => {
  const { lang } = useLanguage();
  const toolbarRef = useRef(null);
  const [notchX, setNotchX] = useState(0);

  const allToolIds = TOOL_GROUP_DEFS.flatMap(g => g.tools.map(t => t.id));
  const isBottomToolActive = (activeTool && allToolIds.includes(activeTool)) || isSplitView;

  useEffect(() => {
    if (toolbarRef.current && isBottomToolActive) {
      const activeBtn = toolbarRef.current.querySelector('.tool-button.active');
      if (activeBtn) {
        const btnRect     = activeBtn.getBoundingClientRect();
        const toolbarRect = toolbarRef.current.getBoundingClientRect();
        setNotchX((btnRect.left - toolbarRect.left) + btnRect.width / 2);
      }
    }
  }, [activeTool, isBottomToolActive, isSplitView]);

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
                const isActive = activeTool === tool.id || 
                               (tool.id === 'split_view' && isSplitView) ||
                               (tool.id === 'split' && isSplitModePersistent);
                return (
                  <button
                    key={tool.id}
                    id={`toolbar-btn-${tool.id}`}
                    className={`tool-button tool-item ${isActive ? 'active' : ''}`}
                    onClick={() => onToolSelect(tool.id)}
                    data-tooltip={label}
                    title={tool.id === 'split' ? "Swipe Maps" : label}
                    aria-label={label}
                  >
                    {tool.id === 'split' ? (
                      <i className="material-icons" style={{ fontSize: '18px' }}>
                        {swipeMode === 'horizontal' ? 'swap_horiz' : 'swap_vert'}
                      </i>
                    ) : tool.id === 'split_view' ? (
                      <i className="material-icons" style={{ fontSize: '18px' }}>splitscreen</i>
                    ) : tool.id === 'blend' ? (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <circle cx="8" cy="12" r="7" />
                        <circle cx="16" cy="12" r="7" />
                      </svg>
                    ) : tool.id === 'arcade' ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H7" />
                      </svg>
                    ) : tool.id === 'spatial_analysis' ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                        <path d="M22 12A10 10 0 0 0 12 2v10z" />
                      </svg>
                    ) : (
                      <Icon size={18} />
                    )}
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
