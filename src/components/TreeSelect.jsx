import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronRight, ChevronLeft, Check, Search } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const TreeSelect = ({ value, onChange, treeData, placeholder = "Select Layer...", showAllOption = false, multi = false, maxHeight = "140px", openDirection = "auto" }) => {
  const { t, lang } = useLanguage();
  const isRTL = lang === 'AR';

  const getDescendantIds = (node) => {
    let ids = [node.id];
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        ids = [...ids, ...getDescendantIds(child)];
      });
    }
    return ids;
  };

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const [expandedNodes, setExpandedNodes] = useState({});
  const [openUpward, setOpenUpward] = useState(false);

  const allOptionId = typeof showAllOption === 'string' ? showAllOption : 'all';
  const allOptionLabel = 'All Visible Layers';

  const [searchQuery, setSearchQuery] = useState('');

  const filterTree = (nodes, query) => {
    if (!query) return nodes;
    const lowerQuery = query.toLowerCase();
    const result = [];
    for (const node of nodes) {
      const matchesSelf = node.title.toLowerCase().includes(lowerQuery);
      let filteredChildren = [];
      if (node.children) {
        filteredChildren = filterTree(node.children, query);
      }
      if (matchesSelf || filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren });
      }
    }
    return result;
  };

  const filteredData = useMemo(() => filterTree(treeData, searchQuery), [treeData, searchQuery]);

  useEffect(() => {
    if (!searchQuery) {
      setExpandedNodes({}); // Collapse all by default or when search is cleared
      return;
    }
    const newExpanded = {};
    const traverse = (nodes) => {
      nodes.forEach(node => {
        if ((node.type === 'root-group' || node.type === 'group') && node.children && node.children.length > 0) {
          newExpanded[node.id] = true;
          traverse(node.children);
        }
      });
    };
    traverse(filteredData);
    setExpandedNodes(newExpanded);
  }, [searchQuery, filteredData]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && containerRef.current) {
      if (openDirection === 'up') {
        setOpenUpward(true);
        return;
      }
      if (openDirection === 'down') {
        setOpenUpward(false);
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 260 && rect.top > 260) {
        setOpenUpward(true);
      } else {
        setOpenUpward(false);
      }
    }
  }, [isOpen, openDirection]);

  const findSelectedTitle = () => {
    if (multi) {
      if (!Array.isArray(value) || value.length === 0) return null;
      if (value.includes(allOptionId)) return allOptionLabel;
      
      const findTitles = (nodes, ids, result = []) => {
        for (const node of nodes) {
          if (ids.includes(node.id)) {
            result.push(node.title);
          }
          if (node.children && node.children.length > 0) {
            findTitles(node.children, ids, result);
          }
        }
        return result;
      };
      
      const titles = findTitles(treeData, value);
      if (titles.length === 0) return null;
      return titles.join(', ');
    } else {
      if (showAllOption && value === allOptionId) return allOptionLabel;
      const findTitle = (nodes) => {
        for (const node of nodes) {
          if (node.id === value) return node.title;
          if (node.children && node.children.length > 0) {
            const title = findTitle(node.children);
            if (title) return title;
          }
        }
        return null;
      };
      return findTitle(treeData) || value;
    }
  };

  const hasValue = multi ? (Array.isArray(value) && value.length > 0) : !!value;
  const displayLabel = hasValue ? (findSelectedTitle() || placeholder) : placeholder;

  const toggleExpand = (nodeId, e) => {
    e.stopPropagation();
    setExpandedNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  const renderTreeNode = (node, depth = 0) => {
    const isExpanded = !!expandedNodes[node.id];
    const isSelected = multi 
      ? (Array.isArray(value) && value.includes(node.id)) 
      : value === node.id;
    const hasChildren = node.children && node.children.length > 0;
    const isSelectable = multi ? true : node.selectable;

    const rowContent = (
      <div 
        className={`option-item ${isSelected ? 'selected' : ''}`}
        style={{ 
          position: 'relative',
          paddingLeft: '8px',
          paddingRight: '12px',
          opacity: isSelectable ? 1 : 0.85,
          cursor: isSelectable ? 'pointer' : 'default',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: '6px',
          backgroundColor: isSelected ? '#fff5f5' : 'transparent',
          minHeight: '24px',
          paddingTop: '2px',
          paddingBottom: '2px',
          borderRadius: '6px'
        }}
        onClick={(e) => {
          if (isSelectable) {
            if (multi) {
              e.stopPropagation();
              const currentValue = Array.isArray(value) ? value : [];
              const descendants = getDescendantIds(node);
              const isNodeSelected = currentValue.includes(node.id);
              let newValue;
              
              if (isNodeSelected) {
                // Remove node and all its descendants from selection
                newValue = currentValue.filter(id => !descendants.includes(id));
              } else {
                // Add node and all its descendants to selection
                const toAdd = descendants.filter(id => !currentValue.includes(id));
                newValue = [...currentValue, ...toAdd];
              }
              onChange(newValue);
            } else {
              onChange(node.id);
              setIsOpen(false);
            }
          } else {
            toggleExpand(node.id, e);
          }
        }}
      >
        {depth > 0 && (
          <div style={{ position: 'absolute', [isRTL ? 'right' : 'left']: '-12px', top: '50%', width: '12px', height: '1px', backgroundColor: '#cbd5e1' }} />
        )}

        {multi ? (
          <div className={`select-checkbox ${isSelected ? 'checked' : ''}`} style={{ margin: isRTL ? '0 0 0 4px' : '0 4px 0 0', flexShrink: 0 }}>
            {isSelected && <Check size={8} color="white" strokeWidth={4} />}
          </div>
        ) : (
          node.type === 'feature' && (
            <div style={{
              width: '14px', height: '14px', borderRadius: '50%',
              border: `1.5px solid ${isSelected ? '#df261c' : '#94a3b8'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              backgroundColor: 'white'
            }}>
              {isSelected && <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#df261c' }} />}
            </div>
          )
        )}

        <span 
          style={{ 
            fontSize: '12px',
            fontWeight: isSelected ? '600' : (node.type === 'root-group' ? '700' : '500'),
            color: isSelected ? '#df261c' : (isSelectable ? '#475569' : '#1a2f4d'),
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            userSelect: 'none',
            flex: 1,
            minWidth: 0
          }}
        >
          {node.title}
        </span>
        {(node.type === 'root-group' || node.type === 'group') && (
          <button
            onClick={(e) => toggleExpand(node.id, e)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              color: '#64748b',
              margin: isRTL ? '0 auto 0 0' : '0 0 0 auto'
            }}
          >
            {isExpanded ? <ChevronDown size={14} /> : (isRTL ? <ChevronLeft size={14} /> : <ChevronRight size={14} />)}
          </button>
        )}
      </div>
    );

    if (depth === 0) {
      return (
        <div key={node.id} style={{
          backgroundColor: '#f8fafc',
          borderRadius: '8px',
          marginBottom: '8px',
          padding: '2px',
          border: '1px solid #f1f5f9'
        }}>
          {rowContent}
          {hasChildren && isExpanded && (
            <div style={{ position: 'relative', paddingTop: '2px', [isRTL ? 'paddingRight' : 'paddingLeft']: '16px', [isRTL ? 'marginRight' : 'marginLeft']: '12px' }}>
              <div style={{ position: 'absolute', [isRTL ? 'right' : 'left']: '4px', top: '0', bottom: '12px', width: '1px', backgroundColor: '#cbd5e1' }} />
              {node.children.map(child => renderTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <React.Fragment key={node.id}>
        {rowContent}
        {hasChildren && isExpanded && (
          <div style={{ position: 'relative', paddingTop: '2px', [isRTL ? 'paddingRight' : 'paddingLeft']: '16px', [isRTL ? 'marginRight' : 'marginLeft']: '12px' }}>
            <div style={{ position: 'absolute', [isRTL ? 'right' : 'left']: '4px', top: '0', bottom: '12px', width: '1px', backgroundColor: '#cbd5e1' }} />
            {node.children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </React.Fragment>
    );
  };

  const isAllSelected = multi 
    ? (Array.isArray(value) && value.includes(allOptionId)) 
    : value === allOptionId;

  return (
    <div className="custom-select-container" ref={containerRef}>
      <div 
        className={`custom-select-trigger ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        style={{ height: '36px', boxSizing: 'border-box' }}
      >
        <span className="selected-value">{displayLabel}</span>
        <ChevronDown size={16} className={`chevron ${isOpen ? 'open' : ''}`} />
      </div>

      {isOpen && (
        <div 
          className="custom-select-dropdown" 
          style={{ 
            position: 'absolute',
            top: openUpward ? 'auto' : 'calc(100% + 4px)',
            bottom: openUpward ? 'calc(100% + 4px)' : 'auto',
            left: 0,
            width: '100%',
            minWidth: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            border: '1px solid #e2e8f0',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
            zIndex: 9999,
            direction: isRTL ? 'rtl' : 'ltr',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'white',
            borderRadius: '8px'
          }}
        >
          <div style={{ padding: '8px 8px 0', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'white' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', [isRTL ? 'right' : 'left']: '8px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input 
                type="text" 
                placeholder={t('Search') + '...'} 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: isRTL ? '6px 28px 6px 8px' : '6px 8px 6px 28px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '12px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>
          <div className="options-list" style={{ maxHeight: maxHeight, overflowY: 'auto', overflowX: 'hidden', padding: '8px' }}>
            {showAllOption && (
              <div 
                style={{
                  backgroundColor: '#f8fafc',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  padding: '2px',
                  border: '1px solid #f1f5f9'
                }}
              >
                <div 
                  className={`option-item ${isAllSelected ? 'selected' : ''}`}
                  style={{
                    paddingLeft: '8px',
                    paddingRight: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    minHeight: '24px',
                    backgroundColor: isAllSelected ? '#fff5f5' : 'transparent',
                    borderRadius: '6px'
                  }}
                  onClick={(e) => {
                    if (multi) {
                      e.stopPropagation();
                      const currentValue = Array.isArray(value) ? value : [];
                      let newValue;
                      if (currentValue.includes(allOptionId)) {
                        newValue = currentValue.filter(id => id !== allOptionId);
                      } else {
                        newValue = [...currentValue, allOptionId];
                      }
                      onChange(newValue);
                    } else {
                      onChange(allOptionId);
                      setIsOpen(false);
                    }
                  }}
                >
                  {multi && (
                    <div className={`select-checkbox ${isAllSelected ? 'checked' : ''}`} style={{ margin: '0 4px 0 0' }}>
                      {isAllSelected && <Check size={8} color="white" strokeWidth={4} />}
                    </div>
                  )}
                  <span style={{ fontSize: '12px', fontWeight: isAllSelected ? '600' : '700', color: isAllSelected ? '#df261c' : '#1a2f4d', flex: 1 }}>
                    {allOptionLabel}
                  </span>
                  {!multi && (
                    <div style={{
                      width: '12px', height: '12px', borderRadius: '3px',
                      border: `1.5px solid ${isAllSelected ? '#df261c' : '#94a3b8'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                      backgroundColor: isAllSelected ? '#df261c' : 'white',
                      marginLeft: 'auto'
                    }}>
                      {isAllSelected && <Check size={8} color="white" strokeWidth={3} />}
                    </div>
                  )}
                </div>
              </div>
            )}

            {filteredData.length > 0 ? (
              filteredData.map(node => renderTreeNode(node, 0))
            ) : (
              <div className="no-options" style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>
                {t('noResultsFound') || 'No layers found'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TreeSelect;
