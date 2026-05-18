import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Database, Play, RotateCcw, ChevronRight, ChevronLeft,
  CheckCircle2, AlertTriangle, Layers, Type, MessageSquare,
  Filter, Eye, Calculator, Search, Code, FolderOpen, Folder,
  ChevronDown, ChevronUp
} from 'lucide-react';
import Editor from '@monaco-editor/react';
import CustomSelect from './CustomSelect';
import './ArcadePanel.css';

// ─── Recursive flattener for dropdown list ──────────────────────────────────
function flattenLayers(sublayers, parentTitle) {
  const items = sublayers.toArray ? sublayers.toArray() : Array.from(sublayers);
  let flat = [];
  items.forEach(sub => {
    const title = sub.title || `Layer ${sub.id}`;
    if (sub.sublayers && sub.sublayers.length > 0) {
      flat = flat.concat(flattenLayers(sub.sublayers, title));
    } else {
      flat.push({
        id: `${sub.layer.id}:::sub:::${sub.id}`,
        title: title,
        label: title,
        group: parentTitle
      });
    }
  });
  return flat;
}

const ArcadePanel = ({ view, layersConfig, settings, onSettingsChange }) => {
  const [selectedLayerId, setSelectedLayerId] = useState(settings?.layerId || '');
  const [expressionType, setExpressionType] = useState('Styling');
  const [expression, setExpression] = useState(settings?.expression || '');
  const [fields, setFields] = useState([]);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [flatLayerOptions, setFlatLayerOptions] = useState([]);
  const [isLoadingLayers, setIsLoadingLayers] = useState(false);
  const [isFunctionsExpanded, setIsFunctionsExpanded] = useState(false);
  const editorRef = useRef(null);

  const expressionTypes = [
    { value: 'Styling',    title: 'Symbology / Renderer' },
    { value: 'Labels',     title: 'Labels' },
    { value: 'Popup',      title: 'Pop-up' },
    { value: 'Filter',     title: 'Filter' },
    { value: 'FieldCalc',  title: 'Field Calculation' },
    { value: 'Visibility', title: 'Visibility' }
  ];

  const arcadeFunctionCategories = [
    {
      name: 'Logical',
      functions: [
        { name: 'When()', template: "When(\n  $feature.FIELD > 100, 'High',\n  $feature.FIELD > 50, 'Medium',\n  'Low'\n)" },
        { name: 'IIf()', template: "IIf($feature.FIELD == 'Active', 'Yes', 'No')" },
        { name: 'IsEmpty()', template: 'IsEmpty($feature.FIELD)' }
      ]
    },
    {
      name: 'Math',
      functions: [
        { name: 'Round()', template: 'Round($feature.FIELD, 2)' },
        { name: 'Abs()', template: 'Abs($feature.FIELD)' },
        { name: 'Max()', template: 'Max($feature.F1, $feature.F2)' }
      ]
    },
    {
      name: 'Text',
      functions: [
        { name: 'Concatenate()', template: 'Concatenate([$feature.F1, $feature.F2], " - ")' },
        { name: 'Upper()', template: 'Upper($feature.FIELD)' },
        { name: 'Left()', template: 'Left($feature.FIELD, 5)' }
      ]
    },
    {
      name: 'Geometry',
      functions: [
        { name: 'Area()', template: 'Area($feature)' },
        { name: 'Length()', template: 'Length($feature)' },
        { name: 'Buffer()', template: 'Buffer($feature, 100, "meters")' }
      ]
    }
  ];

  // ── Load flat layer list ──────────────────────────────────────────────────
  useEffect(() => {
    if (!view || !layersConfig) return;

    const loadLayers = async () => {
      setIsLoadingLayers(true);
      const options = [];

      for (const config of layersConfig) {
        const layer = view.map.findLayerById(config.id);
        if (!layer) continue;
        
        try {
          await layer.load();
          if (layer.type === 'map-image' && layer.sublayers) {
            const subs = flattenLayers(layer.sublayers, config.title);
            options.push(...subs);
          } else if (layer.type === 'feature') {
            options.push({ id: config.id, title: config.title, label: config.title });
          }
        } catch (e) {
          console.warn(`Layer ${config.id} load error:`, e);
        }
      }
      
      const finalOptions = [
        { id: 'all-visible', title: 'All Visible Layers' },
        ...options
      ];
      setFlatLayerOptions(finalOptions);
      setIsLoadingLayers(false);
    };

    loadLayers();
  }, [view, layersConfig]);

  // ── Load fields when layer selection changes ──────────────────────────────
  useEffect(() => {
    if (!selectedLayerId || !view) return;

    const fetchFields = async () => {
      setIsLoadingFields(true);
      setLoadError(null);
      setFields([]);

      try {
        const parts = selectedLayerId.split(':::');
        const parentId = parts[0];
        const subIdStr = parts[2];
        const parentLayer = view.map.findLayerById(parentId);

        if (!parentLayer) {
          setLoadError('Service not found.');
          return;
        }

        let targetFields = [];
        if (parentLayer.type === 'map-image' && subIdStr) {
          const subId = parseInt(subIdStr, 10);
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
            await sublayer.load();
            targetFields = sublayer.fields || [];
          }
        } else if (parentLayer.type === 'feature') {
          await parentLayer.load();
          targetFields = parentLayer.fields || [];
        }

        setFields(targetFields);
      } catch (err) {
        setLoadError('Failed to load schema.');
      } finally {
        setIsLoadingFields(false);
      }
    };

    fetchFields();
  }, [selectedLayerId, view]);

  const handleEditorDidMount = (editor) => { editorRef.current = editor; };

  const insertAtCursor = (text) => {
    if (editorRef.current) {
      const sel = editorRef.current.getSelection();
      editorRef.current.executeEdits('arcade-editor', [{
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

  const handleValidate = () => {
    setIsValidating(true);
    setValidationResult(null);
    setTimeout(() => {
      if (!expression.includes('$feature')) {
        setValidationResult({ status: 'error', message: 'Missing $feature reference.' });
      } else {
        setValidationResult({ status: 'success', message: 'Expression Valid.' });
      }
      setIsValidating(false);
    }, 600);
  };

  const handleApply = () => {
    if (!selectedLayerId) return;
    onSettingsChange({
      layerId: selectedLayerId,
      expression,
      applyTo: expressionType,
      lastRun: Date.now()
    });
  };

  const handleReset = () => {
    setExpression('');
    setValidationResult(null);
    setSelectedLayerId('');
  };

  return (
    <div className="arcade-unified-container">
      <div className="editor-main-content no-scrollbar">
        {/* Layer & Type Selection */}
        <div className="editor-top-grid">
          <div className="form-group">
            <label>Select Layer</label>
            <CustomSelect 
              options={flatLayerOptions.map(opt => ({ value: opt.id, title: opt.title }))}
              value={selectedLayerId}
              onChange={setSelectedLayerId}
              placeholder={isLoadingLayers ? "Loading layers..." : "Choose a layer..."}
            />
          </div>
          <div className="form-group">
            <label>Expression Type</label>
            <CustomSelect 
              options={expressionTypes}
              value={expressionType}
              onChange={setExpressionType}
            />
          </div>
        </div>

        {/* Available Fields */}
        <div className="editor-section-v3">
          <div className="section-header-v3">
            <span>Available Fields</span>
          </div>
          <div className="white-box-container">
            <div className="fields-chip-container">
              {isLoadingFields ? (
                <div className="loading-text">Fetching fields...</div>
              ) : fields.length > 0 ? (
                fields.map(f => (
                  <button 
                    key={f.name} 
                    className="field-chip-v3"
                    onClick={() => insertAtCursor(`$feature.${f.name}`)}
                    title={f.alias || f.name}
                  >
                    {f.alias || f.name}
                  </button>
                ))
              ) : (
                <div className="empty-text">Select a layer to see fields</div>
              )}
            </div>
          </div>
        </div>

        {/* Functions Accordion V4 - Header-less Style */}
        <div className="editor-section-v3">
          <div className={`white-box-container functions-accordion-box ${isFunctionsExpanded ? 'expanded' : ''}`}>
            <button 
              className="accordion-header-v4"
              onClick={() => setIsFunctionsExpanded(!isFunctionsExpanded)}
            >
              <span className="placeholder-text-v4">Functions</span>
              {isFunctionsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {isFunctionsExpanded && (
              <div className="functions-categories v4-content">
                {arcadeFunctionCategories.map(cat => (
                  <div key={cat.name} className="function-cat-group">
                    <span className="cat-label">{cat.name}</span>
                    <div className="cat-funcs">
                      {cat.functions.map(f => (
                        <button key={f.name} className="func-link-v3" onClick={() => insertAtCursor(f.template)}>
                          {f.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Monaco Editor */}
        <div className="editor-workspace">
          <div className="workspace-header">
            <span>Expression Editor</span>
            {validationResult && (
              <span className={`status-tag ${validationResult.status}`}>
                {validationResult.status === 'success' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                {validationResult.status === 'success' ? 'Valid' : 'Error'}
              </span>
            )}
          </div>
          <div className="monaco-unified-wrapper">
            <Editor
              height="180px"
              defaultLanguage="javascript"
              theme="vs-light"
              value={expression}
              onChange={setExpression}
              onMount={handleEditorDidMount}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "'Fira Code', monospace",
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 12, bottom: 12 }
              }}
            />
          </div>
        </div>
      </div>

      {/* Fixed Footer - Responsive Balanced Layout */}
      <div className="editor-footer">
        <button className="editor-btn-secondary" onClick={handleReset}>
          <RotateCcw size={15} /> Reset
        </button>
        <button className="editor-btn-outline" onClick={handleValidate} disabled={isValidating}>
          {isValidating ? 'Validate' : 'Validate'}
        </button>
        <button className="editor-btn-primary" onClick={handleApply} disabled={!selectedLayerId}>
          <Play size={15} /> Apply
        </button>
      </div>
    </div>
  );
};

export default ArcadePanel;
