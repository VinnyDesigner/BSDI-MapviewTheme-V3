import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '../context/LanguageContext';
import { translations } from '../i18n/translations';
import { toolbarConfig } from '../config/toolbar';
import { TOOL_REGISTRY } from '../registry/toolRegistry.jsx';
import './BottomToolbar.css';

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

  // Dynamically map configurations and tool registries into toolbar groups
  const toolGroups = toolbarConfig.groups.map(group => ({
    id: group.id,
    tools: group.toolIds.map(toolId => {
      const registryEntry = TOOL_REGISTRY[toolId];
      if (!registryEntry || registryEntry.toolbar === false) return null;
      return {
        id: registryEntry.id,
        icon: registryEntry.icon
      };
    }).filter(Boolean)
  }));

  const allToolIds = toolGroups.flatMap(g => g.tools.map(t => t.id));
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
  }, [activeTool, isBottomToolActive, isSplitView, toolGroups]);

  return (
    <div className="bottom-toolbar-container">
      <motion.div
        ref={toolbarRef}
        className={`toolbar-wrapper ${isBottomToolActive ? 'has-active-tool' : ''}`}
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1, '--notch-x': `${notchX}px` }}
        transition={{ type: 'spring', damping: 20, stiffness: 100 }}
      >
        {toolGroups.map((group, groupIndex) => (
          <React.Fragment key={group.id}>
            <div className="tool-group">
              {group.tools.map((tool) => {
                const Icon = tool.icon;
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
                    ) : (
                      <Icon size={18} />
                    )}
                  </button>
                );
              })}
            </div>
            {groupIndex < toolGroups.length - 1 && (
              <div className="toolbar-divider" />
            )}
          </React.Fragment>
        ))}
      </motion.div>
    </div>
  );
};

export default BottomToolbar;

