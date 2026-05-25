import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Database, Play, RotateCcw, ChevronRight, ChevronLeft,
  CheckCircle2, AlertTriangle, Layers, Type, MessageSquare,
  Filter, Eye, Calculator, Search, Code, FolderOpen, Folder,
  ChevronDown, ChevronUp
} from 'lucide-react';
import Editor from '@monaco-editor/react';
import CustomSelect from './CustomSelect';
import TreeSelect from './TreeSelect';
import { useLanguage } from '../context/LanguageContext';
import './ArcadePanel.css';

// ─── Recursive builder for tree dropdown list ──────────────────────────────────
function buildTreeFromSublayers(sublayers, parentId) {
  const items = sublayers.toArray ? sublayers.toArray() : Array.from(sublayers);
  // ArcGIS MapImageLayer sublayers are usually in reverse order for rendering, 
  // but we'll just keep the API order. We can reverse if needed, but standard is fine.
  return items.map(sub => {
    const title = sub.title || `Layer ${sub.id}`;
    const nodeId = `${parentId}:::sub:::${sub.id}`;
    if (sub.sublayers && sub.sublayers.length > 0) {
      return {
        id: nodeId + '_group',
        title: title,
        type: 'group',
        selectable: false,
        children: buildTreeFromSublayers(sub.sublayers, parentId)
      };
    } else {
      return {
        id: nodeId,
        title: title,
        type: 'feature',
        selectable: true,
        children: []
      };
    }
  });
}

const ArcadePanel = ({ view, layersConfig, settings, onSettingsChange }) => {
  const { t, lang } = useLanguage();
  const isRTL = lang === 'AR';

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
    { value: 'Styling',    title: t('Symbology / Renderer') || 'Symbology / Renderer' },
    { value: 'Labels',     title: t('Labels') || 'Labels' },
    { value: 'Popup',      title: t('Pop-up') || 'Pop-up' },
    { value: 'Filter',     title: t('Filter') || 'Filter' },
    { value: 'FieldCalc',  title: t('Field Calculation') || 'Field Calculation' },
    { value: 'Visibility', title: t('Visibility') || 'Visibility' }
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

  // ── Load hierarchical layer tree ──────────────────────────────────────────────────
  useEffect(() => {
    if (!view || !layersConfig) return;

    const loadLayers = async () => {
      setIsLoadingLayers(true);
      const tree = [];

      for (const config of layersConfig) {
        const layer = view.map.findLayerById(config.id);
        if (!layer) continue;
        
        try {
          await layer.load();
          if (layer.type === 'map-image' && layer.sublayers) {
            const rootChildren = buildTreeFromSublayers(layer.sublayers, config.id);
            if (rootChildren.length > 0) {
              tree.push({
                id: config.id,
                title: config.title,
                type: 'root-group',
                selectable: false,
                children: rootChildren
              });
            }
          } else if (layer.type === 'feature') {
            tree.push({
              id: config.id,
              title: config.title,
              type: 'feature',
              selectable: true,
              children: []
            });
          }
        } catch (e) {
          console.warn(`Layer ${config.id} load error:`, e);
        }
      }
      
      setFlatLayerOptions(tree);
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
    <div className="arcade-unified-container" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <div className="editor-main-content no-scrollbar">
        {/* Layer & Type Selection */}
        <div className="editor-top-grid">
          <div className="form-group">
            <label>{t('Select Layer')}</label>
            <TreeSelect 
              treeData={flatLayerOptions}
              value={selectedLayerId}
              onChange={setSelectedLayerId}
              placeholder={isLoadingLayers ? t('gpSelectPlaceholder') + "..." : t('Select Layer') + "..."}
              showAllOption={false}
            />
          </div>
          <div className="form-group">
            <label>{t('Expression Type') || 'Expression Type'}</label>
            <CustomSelect 
              options={expressionTypes.map(opt => ({ value: opt.value, label: opt.title }))}
              value={expressionType}
              onChange={setExpressionType}
            />
          </div>
        </div>

        {/* Available Fields */}
        <div className="editor-section-v3">
          <div className="section-header-v3">
            <span>{t('Available Fields') || 'Available Fields'}</span>
          </div>
          <div className="white-box-container">
            <div className="fields-chip-container">
              {isLoadingFields ? (
                <div className="loading-text">{t('Loading') || 'Fetching fields...'}</div>
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
                <div className="empty-text">{t('Select a layer to see fields') || 'Select a layer to see fields'}</div>
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
              <span className="placeholder-text-v4">{t('Functions') || 'Functions'}</span>
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
            <span>{t('Expression Editor') || 'Expression Editor'}</span>
            {validationResult && (
              <span className={`status-tag ${validationResult.status}`}>
                {validationResult.status === 'success' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                {validationResult.status === 'success' ? (t('Valid') || 'Valid') : (t('Error') || 'Error')}
              </span>
            )}
          </div>
          <div className="monaco-unified-wrapper" style={{ direction: 'ltr' /* Monaco stays LTR */ }}>
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
          <RotateCcw size={15} /> {t('Reset') || 'Reset'}
        </button>
        <button className="editor-btn-outline" onClick={handleValidate} disabled={isValidating}>
          {isValidating ? (t('Validating') || 'Validating') : (t('Validate') || 'Validate')}
        </button>
        <button className="editor-btn-primary" onClick={handleApply} disabled={!selectedLayerId}>
          <Play size={15} /> {t('Apply') || 'Apply'}
        </button>
      </div>
    </div>
  );
};

export default ArcadePanel;
