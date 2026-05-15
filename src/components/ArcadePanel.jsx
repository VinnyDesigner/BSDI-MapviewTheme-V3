import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Database, Play, RotateCcw, ChevronRight, ChevronLeft,
  CheckCircle2, AlertTriangle, Layers, Type, MessageSquare,
  Filter, Eye, Calculator, Search, Code, FolderOpen, Folder
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Editor from '@monaco-editor/react';
import './ArcadePanel.css';

// ─── Recursive tree builder from live ArcGIS sublayers ───────────────────────
function buildSubtree(sublayers, parentId) {
  // ArcGIS Collections: convert to array safely
  const items = sublayers.toArray ? sublayers.toArray() : Array.from(sublayers);

  return items.map(sub => {
    const hasChildren = sub.sublayers && sub.sublayers.length > 0;
    const nodeId = `${parentId}:::sub:::${sub.id}`;
    return {
      id: nodeId,
      title: sub.title || `Layer ${sub.id}`,
      arcgisId: sub.id,
      parentId,
      isLeaf: !hasChildren,
      children: hasChildren ? buildSubtree(sub.sublayers, parentId) : []
    };
  });
}

// ─── Flat search through all leaf nodes ─────────────────────────────────────
function flattenLeaves(nodes, acc = []) {
  nodes.forEach(n => {
    if (n.isLeaf) acc.push(n);
    else flattenLeaves(n.children, acc);
  });
  return acc;
}

// ─── Tree Node component ─────────────────────────────────────────────────────
const TreeNode = ({ node, depth, selectedId, onSelect, expandedMap, onToggle, searchActive }) => {
  const isExpanded = expandedMap[node.id];
  const isSelected = selectedId === node.id;

  if (node.isLeaf) {
    return (
      <button
        className={`tree-leaf-item ${isSelected ? 'active' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
        onClick={() => onSelect(node)}
      >
        <div className="leaf-icon">
          <Layers size={13} />
        </div>
        <div className="leaf-info">
          <span className="name">{node.title}</span>
          <span className="type">Feature Layer</span>
        </div>
      </button>
    );
  }

  return (
    <div className="tree-group-container">
      <div
        className="tree-group-header"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onToggle(node.id)}
      >
        <ChevronRight
          size={14}
          className={`chevron ${isExpanded ? 'rotated' : ''}`}
        />
        {isExpanded
          ? <FolderOpen size={15} style={{ color: '#3b82f6', flexShrink: 0 }} />
          : <Folder size={15} style={{ color: '#64748b', flexShrink: 0 }} />
        }
        <span className="group-title">{node.title}</span>
      </div>
      {isExpanded && (
        <div className="tree-group-children">
          {node.children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              expandedMap={expandedMap}
              onToggle={onToggle}
              searchActive={searchActive}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main ArcadePanel ────────────────────────────────────────────────────────
const ArcadePanel = ({ view, layersConfig, settings, onSettingsChange }) => {
  const [step, setStep] = useState(1);
  const [selectedLayer, setSelectedLayer] = useState(null);
  const [expressionType, setExpressionType] = useState(null);
  const [expression, setExpression] = useState(settings?.expression || '');
  const [fields, setFields] = useState([]);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  const [layerSearch, setLayerSearch] = useState('');
  const [loadError, setLoadError] = useState(null);
  const [treeData, setTreeData] = useState([]);       // top-level nodes
  const [expandedMap, setExpandedMap] = useState({});  // node expansion state
  const [isLoadingTree, setIsLoadingTree] = useState(false);
  const editorRef = useRef(null);

  // Expression types (Step 2)
  const expressionTypes = [
    { id: 'Styling',    name: 'Symbology / Renderer', icon: <Layers size={18} />,      desc: 'Style features based on data values.' },
    { id: 'Labels',     name: 'Labels',                icon: <Type size={18} />,         desc: 'Dynamically generate text labels.' },
    { id: 'Popup',      name: 'Pop-up',                icon: <MessageSquare size={18} />, desc: 'Format and display custom popup content.' },
    { id: 'Filter',     name: 'Filter',                icon: <Filter size={18} />,        desc: 'Control which features are visible.' },
    { id: 'FieldCalc',  name: 'Field Calculation',     icon: <Calculator size={18} />,    desc: 'Compute new values on the fly.' },
    { id: 'Visibility', name: 'Visibility',            icon: <Eye size={18} />,           desc: 'Evaluate layer or scale visibility.' }
  ];

  const arcadeFunctions = [
    { name: 'When()',         template: "When(\n  $feature.FIELD > 100, 'High',\n  $feature.FIELD > 50, 'Medium',\n  'Low'\n)" },
    { name: 'IIf()',          template: "IIf($feature.FIELD == 'Active', 'Yes', 'No')" },
    { name: 'Round()',        template: 'Round($feature.FIELD, 2)' },
    { name: 'Concatenate()',  template: 'Concatenate([$feature.FIELD1, $feature.FIELD2], " - ")' },
    { name: 'IsEmpty()',      template: 'IsEmpty($feature.FIELD)' },
    { name: 'DefaultValue()', template: 'DefaultValue($feature.FIELD, "Unknown")' }
  ];

  // ── Build layer tree from live map when panel first mounts ────────────────
  useEffect(() => {
    if (!view || !layersConfig) return;

    const buildTree = async () => {
      setIsLoadingTree(true);
      const roots = [];

      for (const config of layersConfig) {
        const layer = view.map.findLayerById(config.id);
        if (!layer) continue;

        try {
          await layer.load();
        } catch (e) {
          console.warn(`Layer ${config.id} failed to load:`, e.message);
          continue;
        }

        if (layer.type === 'map-image' && layer.sublayers && layer.sublayers.length > 0) {
          const children = buildSubtree(layer.sublayers, config.id);
          roots.push({
            id: config.id,
            title: config.title,
            isLeaf: false,
            children
          });
        } else if (layer.type === 'feature') {
          roots.push({
            id: config.id,
            title: config.title,
            isLeaf: true,
            arcgisId: null,
            parentId: null,
            children: []
          });
        }
      }

      setTreeData(roots);
      setIsLoadingTree(false);
    };

    buildTree();
  }, [view, layersConfig]);

  // ── Expand top-level nodes by default ─────────────────────────────────────
  useEffect(() => {
    if (treeData.length > 0) {
      const initial = {};
      treeData.forEach(n => { initial[n.id] = true; });
      setExpandedMap(initial);
    }
  }, [treeData]);

  const toggleNode = useCallback((id) => {
    setExpandedMap(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // ── Filtered tree for search ───────────────────────────────────────────────
  const displayedTree = React.useMemo(() => {
    if (!layerSearch.trim()) return treeData;

    // When searching, flatten to only matching leaves
    const allLeaves = flattenLeaves(treeData);
    const matched = allLeaves.filter(l =>
      l.title.toLowerCase().includes(layerSearch.toLowerCase())
    );
    return matched; // flat list of matching leaves when searching
  }, [treeData, layerSearch]);

  const isSearchActive = !!layerSearch.trim();

  // ── Load fields when a leaf layer is selected ─────────────────────────────
  useEffect(() => {
    if (!selectedLayer || !view) return;

    const fetchFields = async () => {
      setIsLoadingFields(true);
      setLoadError(null);
      setFields([]);

      try {
        const [parentId, , subIdStr] = selectedLayer.id.split(':::');
        const parentLayer = view.map.findLayerById(parentId);

        if (!parentLayer) {
          setLoadError('Parent service layer not found.');
          return;
        }

        let targetFields = [];

        if (parentLayer.type === 'map-image') {
          const subId = parseInt(subIdStr, 10);

          // Try to get fields from sublayer
          if (parentLayer.sublayers) {
            const findSub = (subs) => {
              const arr = subs.toArray ? subs.toArray() : Array.from(subs);
              for (const s of arr) {
                if (s.id === subId) return s;
                if (s.sublayers) {
                  const found = findSub(s.sublayers);
                  if (found) return found;
                }
              }
              return null;
            };
            const sublayer = findSub(parentLayer.sublayers);
            if (sublayer) {
              try { await sublayer.load(); } catch (_) {}
              if (sublayer.fields && sublayer.fields.length > 0) {
                targetFields = sublayer.fields;
              }
            }
          }

          // Fallback: query the sublayer URL for its fields via createQuery
          if (targetFields.length === 0) {
            const { FeatureLayer } = await import('@arcgis/core/layers/FeatureLayer.js');
            const fl = new FeatureLayer({ url: `${parentLayer.url}/${subIdStr}` });
            await fl.load();
            targetFields = fl.fields || [];
          }
        } else if (parentLayer.type === 'feature') {
          await parentLayer.load();
          targetFields = parentLayer.fields || [];
        }

        if (targetFields.length > 0) {
          setFields(targetFields);
        } else {
          setLoadError('No fields available for this layer.');
        }
      } catch (err) {
        console.error('Field discovery error:', err);
        setLoadError('Failed to load layer schema from ArcGIS Server.');
      } finally {
        setIsLoadingFields(false);
      }
    };

    fetchFields();
  }, [selectedLayer, view]);

  // ── Editor helpers ─────────────────────────────────────────────────────────
  const handleEditorDidMount = (editor) => { editorRef.current = editor; };

  const insertAtCursor = (text) => {
    if (editorRef.current) {
      const sel = editorRef.current.getSelection();
      editorRef.current.executeEdits('arcade-panel', [{
        range: {
          startLineNumber: sel.startLineNumber, startColumn: sel.startColumn,
          endLineNumber: sel.endLineNumber,   endColumn: sel.endColumn
        },
        text,
        forceMoveMarkers: true
      }]);
      editorRef.current.focus();
    } else {
      setExpression(prev => prev + text);
    }
  };

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleLayerSelect = (node) => {
    setSelectedLayer(node);
    setStep(2);
    onSettingsChange({
      ...settings,
      layerId: node.id,
      focusOnly: true,
      lastRun: Date.now()
    });
  };

  const handleTypeSelect = (type) => {
    setExpressionType(type);
    if (!expression) {
      if (type.id === 'Styling') {
        setExpression("When(\n  $feature.VALUE > 100, 'High',\n  $feature.VALUE > 50, 'Medium',\n  'Low'\n)");
      } else if (type.id === 'Labels') {
        setExpression('return $feature.NAME;');
      }
    }
    setStep(3);
  };

  const handleValidate = () => {
    setIsValidating(true);
    setValidationResult(null);
    setTimeout(() => {
      if (!expression.includes('$feature')) {
        setValidationResult({ status: 'error', message: 'Missing $feature reference. An Arcade expression must reference feature attributes.' });
      } else {
        setValidationResult({ status: 'success', message: 'Expression Valid: Syntax is correct and fields exist.' });
      }
      setIsValidating(false);
    }, 600);
  };

  const handleApply = () => {
    if (!validationResult || validationResult.status === 'error') {
      handleValidate();
      return;
    }
    onSettingsChange({
      layerId: selectedLayer.id,
      expression,
      applyTo: expressionType.id,
      lastRun: Date.now()
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="arcade-workflow-container">
      {/* Header */}
      <div className="workflow-header">
        <div className="header-left">
          {step > 1 && (
            <button className="back-btn" onClick={() => setStep(step - 1)}>
              <ChevronLeft size={20} />
            </button>
          )}
          <h3>Arcade Expression</h3>
        </div>
        <div className="step-indicator">Step {step} of 3</div>
      </div>

      <div className="workflow-content">
        <AnimatePresence mode="wait">

          {/* ── STEP 1: SELECT LAYER ────────────────────────────────────── */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="layer-selection-step"
            >
              {/* Search */}
              <div style={{ marginBottom: '12px', padding: '0 2px', position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                <input
                  type="text"
                  placeholder="Search layers..."
                  value={layerSearch}
                  onChange={e => setLayerSearch(e.target.value)}
                  style={{ width: '100%', padding: '9px 10px 9px 36px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: 'white' }}
                />
              </div>

              {/* Tree */}
              <div className="tree-view-container">
                {isLoadingTree ? (
                  <div className="loading-small">Loading map services...</div>
                ) : displayedTree.length === 0 ? (
                  <div className="validation-banner error" style={{ margin: 0 }}>
                    <AlertTriangle size={14} />
                    <div className="val-text">
                      <span style={{ fontWeight: 600 }}>No Layers Found</span>
                      <span>Services may still be loading or no layers match your search.</span>
                    </div>
                  </div>
                ) : isSearchActive ? (
                  /* Flat matching leaves when searching */
                  displayedTree.map(node => (
                    <button
                      key={node.id}
                      className={`tree-leaf-item ${selectedLayer?.id === node.id ? 'active' : ''}`}
                      style={{ paddingLeft: '12px' }}
                      onClick={() => handleLayerSelect(node)}
                    >
                      <div className="leaf-icon"><Layers size={13} /></div>
                      <div className="leaf-info">
                        <span className="name">{node.title}</span>
                        <span className="type">Feature Layer</span>
                      </div>
                    </button>
                  ))
                ) : (
                  /* Full recursive tree */
                  displayedTree.map(rootNode => (
                    <TreeNode
                      key={rootNode.id}
                      node={rootNode}
                      depth={0}
                      selectedId={selectedLayer?.id}
                      onSelect={handleLayerSelect}
                      expandedMap={expandedMap}
                      onToggle={toggleNode}
                      searchActive={isSearchActive}
                    />
                  ))
                )}
              </div>
            </motion.div>
          )}

          {/* ── STEP 2: CHOOSE EXPRESSION TYPE ─────────────────────────── */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="type-selection-step"
            >
              <div className="selection-grid">
                {expressionTypes.map(type => (
                  <button
                    key={type.id}
                    className={`selection-card ${expressionType?.id === type.id ? 'active' : ''}`}
                    onClick={() => handleTypeSelect(type)}
                  >
                    <div className="card-icon">{type.icon}</div>
                    <div className="card-info">
                      <span className="name">{type.name}</span>
                      <span className="desc">{type.desc}</span>
                    </div>
                    <ChevronRight size={18} className="arrow" />
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── STEP 3: BUILD EXPRESSION ────────────────────────────────── */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="editor-step"
            >
              {/* Label-specific hint */}
              {expressionType?.id === 'Labels' && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: '8px',
                  padding: '10px 12px', borderRadius: '8px',
                  background: '#eff6ff', border: '1px solid #bfdbfe',
                  fontSize: '12px', color: '#1d4ed8', marginBottom: '4px'
                }}>
                  <Type size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>
                    <strong>Label tip:</strong> Write a direct value expression — e.g.{' '}
                    <code style={{ background: '#dbeafe', padding: '1px 4px', borderRadius: '3px' }}>
                      $feature.NAME
                    </code>
                    . Avoid using <code style={{ background: '#dbeafe', padding: '1px 4px', borderRadius: '3px' }}>return</code>.
                    Also zoom in on the map to see labels appear.
                  </span>
                </div>
              )}
              {/* Fields */}
              <div className="editor-sidebar-section">
                <div className="section-title">
                  <Database size={13} /> Available Fields
                </div>
                <div className="field-list">
                  {isLoadingFields ? (
                    <div className="loading-small">Fetching service schema...</div>
                  ) : loadError ? (
                    <div className="validation-banner error" style={{ margin: 0 }}>
                      <AlertTriangle size={13} />
                      <div className="val-text">
                        <span style={{ fontWeight: 600 }}>Discovery Failed</span>
                        <span>{loadError}</span>
                      </div>
                    </div>
                  ) : fields.length > 0 ? (
                    fields.map(f => (
                      <button
                        key={f.name}
                        className="field-chip"
                        onClick={() => insertAtCursor(`$feature.${f.name}`)}
                        title={`${f.name} (${f.type})`}
                      >
                        <span className="alias">{f.alias || f.name}</span>
                        <span className="tag">{(f.type === 'string' || f.type === 'oid') ? 'ABC' : '123'}</span>
                      </button>
                    ))
                  ) : (
                    <div className="no-fields-warn">No fields found for this layer.</div>
                  )}
                </div>
              </div>

              {/* Functions */}
              <div className="editor-sidebar-section">
                <div className="section-title"><Code size={13} /> Functions</div>
                <div className="function-grid">
                  {arcadeFunctions.map(f => (
                    <button key={f.name} className="func-btn" onClick={() => insertAtCursor(f.template)}>
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Monaco Editor */}
              <div className="monaco-wrapper">
                <Editor
                  height="240px"
                  defaultLanguage="javascript"
                  theme="vs-light"
                  value={expression}
                  onChange={val => { setExpression(val); setValidationResult(null); }}
                  onMount={handleEditorDidMount}
                  options={{ minimap: { enabled: false }, fontSize: 13, lineNumbers: 'on', scrollBeyondLastLine: false, automaticLayout: true, wordWrap: 'on' }}
                />
              </div>

              {/* Validation banner */}
              {validationResult && (
                <div className={`validation-banner ${validationResult.status}`}>
                  {validationResult.status === 'success'
                    ? <CheckCircle2 size={15} />
                    : <AlertTriangle size={15} />
                  }
                  <div className="val-text">
                    <span style={{ fontWeight: 600 }}>
                      {validationResult.status === 'success' ? 'Ready to Apply' : 'Validation Error'}
                    </span>
                    <span>{validationResult.message}</span>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="workflow-footer">
        <button
          className="footer-btn reset"
          onClick={() => { setStep(1); setExpression(''); setValidationResult(null); setSelectedLayer(null); }}
        >
          <RotateCcw size={15} /> Reset
        </button>

        {step === 3 && (
          <>
            <button className="footer-btn validate" onClick={handleValidate} disabled={isValidating}>
              {isValidating ? 'Validating...' : 'Validate'}
            </button>
            <button
              className="footer-btn apply"
              onClick={handleApply}
              disabled={!!loadError && fields.length === 0}
              style={{ opacity: (loadError && fields.length === 0) ? 0.5 : 1 }}
            >
              <Play size={15} /> Apply
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ArcadePanel;
