import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';

const TreeSelect = ({ value, onChange, treeData, placeholder = "Select Layer...", showAllOption = false, multi = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const [expandedNodes, setExpandedNodes] = useState({});

  const allOptionId = typeof showAllOption === 'string' ? showAllOption : 'all';
  const allOptionLabel = 'All Visible Layers';

  useEffect(() => {
    // Default expand all group/root nodes
    const initialExpanded = {};
    const traverse = (nodes) => {
      nodes.forEach(node => {
        if (node.type === 'root-group' || node.type === 'group') {
          initialExpanded[node.id] = true;
          if (node.children) traverse(node.children);
        }
      });
    };
    traverse(treeData);
    setExpandedNodes(initialExpanded);
  }, [treeData]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      if (titles.length === 1) return titles[0];
      return `${titles.length} layers selected`;
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
    const isExpanded = expandedNodes[node.id] !== false;
    const isSelected = multi 
      ? (Array.isArray(value) && value.includes(node.id)) 
      : value === node.id;
    const hasChildren = node.children && node.children.length > 0;
    const isSelectable = node.selectable;

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
              let newValue;
              if (currentValue.includes(node.id)) {
                newValue = currentValue.filter(id => id !== node.id);
              } else {
                newValue = [...currentValue, node.id];
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
          <div style={{ position: 'absolute', left: '-12px', top: '50%', width: '12px', height: '1px', backgroundColor: '#cbd5e1' }} />
        )}

        {node.type === 'feature' && (
          multi ? (
            <div className={`select-checkbox ${isSelected ? 'checked' : ''}`} style={{ margin: '0 4px 0 0' }}>
              {isSelected && <Check size={8} color="white" strokeWidth={4} />}
            </div>
          ) : (
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
            flex: 1
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
              margin: '0 0 0 auto'
            }}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
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
            <div style={{ position: 'relative', paddingTop: '2px', paddingLeft: '16px', marginLeft: '12px' }}>
              <div style={{ position: 'absolute', left: '4px', top: '0', bottom: '12px', width: '1px', backgroundColor: '#cbd5e1' }} />
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
          <div style={{ position: 'relative', paddingTop: '2px', paddingLeft: '16px', marginLeft: '12px' }}>
            <div style={{ position: 'absolute', left: '4px', top: '0', bottom: '12px', width: '1px', backgroundColor: '#cbd5e1' }} />
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
            width: '100%',
            maxWidth: 'none',
            maxHeight: '300px', 
            overflowY: 'auto',
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            zIndex: 9999
          }}
        >
          <div className="options-list" style={{ maxHeight: '280px', padding: '8px' }}>
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

            {treeData.length > 0 ? (
              treeData.map(node => renderTreeNode(node, 0))
            ) : (
              <div className="no-options" style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>
                No layers active
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TreeSelect;
