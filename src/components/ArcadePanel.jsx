import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Database, Play, RotateCcw, ChevronRight, ChevronLeft,
  CheckCircle2, AlertTriangle, Layers, Type, MessageSquare,
  Filter, Eye, Calculator, Search, Code, FolderOpen, Folder,
  ChevronDown, ChevronUp, Check
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

const ArcadePanel = ({ view, layersConfig, settings, onSettingsChange, treeData }) => {
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
  const flatLayerOptions = treeData || [];
  const isLoadingLayers = false;
  const [isFunctionsExpanded, setIsFunctionsExpanded] = useState(false);
  const editorRef = useRef(null);

  // States and refs for searchable field dropdown
  const [selectedField, setSelectedField] = useState('');
  const [fieldSearchTerm, setFieldSearchTerm] = useState('');
  const [isFieldDropdownOpen, setIsFieldDropdownOpen] = useState(false);
  const fieldDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (fieldDropdownRef.current && !fieldDropdownRef.current.contains(event.target)) {
        setIsFieldDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (fields.length > 0) {
      const defaultField = fields.find(f => f.name.toLowerCase() === 'objectid' || f.name.toLowerCase() === 'fid' || f.name.toLowerCase() === 'id') || fields[0];
      setSelectedField(defaultField.name);
    } else {
      setSelectedField('');
    }
  }, [fields]);

  const selectedLayerName = useMemo(() => {
    if (!selectedLayerId || !view) return '';
    let parentId = selectedLayerId;
    let subIdStr = null;

    if (selectedLayerId.includes(':::sub:::')) {
      const parts = selectedLayerId.split(':::sub:::');
      parentId = parts[0];
      subIdStr = parts[1];
    } else if (selectedLayerId.includes('_sub_')) {
      const parts = selectedLayerId.split('_sub_');
      parentId = parts[0];
      subIdStr = parts[1];
    } else if (selectedLayerId.includes(':::')) {
      const parts = selectedLayerId.split(':::');
      parentId = parts[0];
      subIdStr = parts[2];
    }

    const parentLayer = view.map.allLayers?.find(l => l.id === parentId) || view.map.findLayerById(parentId);
    if (!parentLayer) return '';

    if (subIdStr && parentLayer.allSublayers) {
      const sublayer = parentLayer.allSublayers.find(s => String(s.id) === String(subIdStr));
      if (sublayer) {
        return `${parentLayer.title || parentLayer.name} - ${sublayer.title || sublayer.name}`;
      }
    }
    return parentLayer.title || parentLayer.name || parentId;
  }, [selectedLayerId, view]);

  const expressionTypes = [
    { value: 'Styling',    title: t('Symbology / Renderer') || 'Symbology / Renderer' },
    { value: 'Labels',     title: t('Labels') || 'Labels' },
    { value: 'Popup',      title: t('Pop-up') || 'Pop-up' },
    { value: 'Filter',     title: t('Filter') || 'Filter' },
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

  // ── Load fields when layer selection changes ──────────────────────────────
  useEffect(() => {
    if (!selectedLayerId || !view) return;

    const fetchFields = async () => {
      setIsLoadingFields(true);
      setLoadError(null);
      setFields([]);

      try {
        let parentId = selectedLayerId;
        let subIdStr = null;

        if (selectedLayerId.includes(':::sub:::')) {
          const parts = selectedLayerId.split(':::sub:::');
          parentId = parts[0];
          subIdStr = parts[1];
        } else if (selectedLayerId.includes('_sub_')) {
          const parts = selectedLayerId.split('_sub_');
          parentId = parts[0];
          subIdStr = parts[1];
        } else if (selectedLayerId.includes(':::')) {
          const parts = selectedLayerId.split(':::');
          parentId = parts[0];
          subIdStr = parts[2];
        }

        const parentLayer = view.map.allLayers.find(l => l.id === parentId) || view.map.findLayerById(parentId);

        if (!parentLayer) {
          setLoadError('Service layer not found in map.');
          return;
        }

        // Execute load
        await parentLayer.load();

        let targetFields = [];
        if (subIdStr) {
          const FeatureLayerModule = await import('@arcgis/core/layers/FeatureLayer');
          const FeatureLayer = FeatureLayerModule.default || FeatureLayerModule;
          const sublayerUrl = `${parentLayer.url}/${subIdStr}`;
          
          const tempFeatureLayer = new FeatureLayer({
            url: sublayerUrl
          });
          
          await tempFeatureLayer.load();
          targetFields = tempFeatureLayer.fields || [];
        } else {
          targetFields = parentLayer.fields || [];
        }

        console.log("Selected Layer:", parentLayer.title || parentLayer.name);
        console.log("Layer ID:", parentLayer.id);
        const targetUrl = subIdStr ? `${parentLayer.url}/${subIdStr}` : parentLayer.url;
        console.log("Layer URL:", targetUrl);
        console.log("Total Fields:", targetFields.length);
        console.log("Fields Returned:", targetFields);

        setFields(targetFields);
      } catch (err) {
        console.error("Arcade Panel: Failed to load layer metadata.", err);
        let parentId = selectedLayerId;
        let subIdStr = null;
        if (selectedLayerId.includes('_sub_')) {
          const parts = selectedLayerId.split('_sub_');
          parentId = parts[0];
          subIdStr = parts[1];
        } else if (selectedLayerId.includes(':::sub:::')) {
          const parts = selectedLayerId.split(':::sub:::');
          parentId = parts[0];
          subIdStr = parts[1];
        }
        const parentLayer = view.map.allLayers.find(l => l.id === parentId) || view.map.findLayerById(parentId);
        const failingUrl = parentLayer 
          ? (subIdStr ? `${parentLayer.url}/${subIdStr}` : parentLayer.url)
          : 'Unknown URL';
        console.error("Failing URL:", failingUrl);
        setLoadError(`Failed to load schema for URL: ${failingUrl}.`);
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

  const handleValidate = async () => {
    setIsValidating(true);
    setValidationResult(null);
    try {
      if (!expression || !expression.includes('$feature')) {
        throw new Error('Missing $feature reference.');
      }
      const arcade = await import("@arcgis/core/arcade");
      const customProfile = {
        variables: [
          { name: "$feature", type: "feature" }
        ]
      };
      await arcade.createArcadeExecutor(expression, customProfile);
      setValidationResult({ status: 'success', message: 'Expression compiles successfully.' });
    } catch (err) {
      console.error("Arcade validation failed:", err);
      setValidationResult({ status: 'error', message: err.message || 'Validation error.' });
    } finally {
      setIsValidating(false);
    }
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
        <div className="editor-section-v3" ref={fieldDropdownRef}>
          <div className="section-header-v3" style={{ marginBottom: '4px' }}>
            <span>{t('Available Fields') || 'Available Fields'}</span>
          </div>
          <div className="custom-select-container">
            <div 
              className={`custom-select-trigger ${isFieldDropdownOpen ? 'active' : ''} ${fields.length === 0 ? 'disabled' : ''}`}
              onClick={() => {
                if (fields.length > 0) {
                  setIsFieldDropdownOpen(!isFieldDropdownOpen);
                }
              }}
            >
              <span className="selected-value" style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                {fields.length > 0 ? `[ ${selectedField || 'select field'} ]` : `[ ${t('Select a layer to see fields') || 'Select a layer to see fields'} ]`}
              </span>
              <ChevronDown size={16} className={`chevron ${isFieldDropdownOpen ? 'open' : ''}`} />
            </div>

            {isFieldDropdownOpen && (
              <div className="custom-select-dropdown" style={{ maxHeight: '130px' }}>
                {/* Search Input */}
                <div className="select-search-wrapper">
                  <Search size={14} className="search-icon" />
                  <input
                    type="text"
                    className="select-search-input"
                    placeholder={t('Search fields...') || 'Search fields...'}
                    value={fieldSearchTerm}
                    onChange={(e) => setFieldSearchTerm(e.target.value)}
                    autoFocus
                  />
                </div>

                {/* Fields List */}
                <div className="options-list" style={{ maxHeight: '90px' }}>
                  {fields
                    .filter(f => f.name.toLowerCase().includes(fieldSearchTerm.toLowerCase()))
                    .map((f, index) => {
                      const isSelected = f.name === selectedField;
                      return (
                        <div
                          key={f.name || index}
                          className={`option-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedField(f.name);
                            insertAtCursor(`$feature.${f.name}`);
                            setIsFieldDropdownOpen(false);
                            setFieldSearchTerm('');
                          }}
                          style={{ fontFamily: 'monospace' }}
                        >
                          <span>{f.name}</span>
                          {isSelected && <Check size={14} className="check-icon" />}
                        </div>
                      );
                    })}
                  {fields.filter(f => f.name.toLowerCase().includes(fieldSearchTerm.toLowerCase())).length === 0 && (
                    <div className="no-options">
                      {t('No fields found') || 'No fields found'}
                    </div>
                  )}
                </div>
              </div>
            )}
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
              height="120px"
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

        {/* Diagnostics Info */}
        <div className="editor-section-v3">
          <div className="diagnostics-card">
            <div className="diagnostics-header">
              <span>{t('Diagnostics') || 'Diagnostics'}</span>
            </div>
            <div className="diagnostics-grid">
              <div className="diag-item">
                <span className="diag-label">{t('Selected Layer') || 'Selected Layer'}:</span>
                <span className="diag-value" title={selectedLayerName}>{selectedLayerName || '--'}</span>
              </div>
              <div className="diag-item">
                <span className="diag-label">{t('Total Fields') || 'Total Fields'}:</span>
                <span className="diag-value">{fields.length}</span>
              </div>
              <div className="diag-item">
                <span className="diag-label">{t('Compatible Fields') || 'Compatible Fields'}:</span>
                <span className="diag-value">{fields.filter(f => f.type !== 'geometry').length}</span>
              </div>
              <div className="diag-item">
                <span className="diag-label">{t('Expression Type') || 'Expression Type'}:</span>
                <span className="diag-value">{expressionType}</span>
              </div>
              <div className="diag-item">
                <span className="diag-label">{t('Validation Result') || 'Validation Result'}:</span>
                <span className={`diag-value val-status ${validationResult?.status || ''}`} title={validationResult?.message || ''}>
                  {validationResult ? validationResult.message : (t('Not Validated') || 'Not Validated')}
                </span>
              </div>
            </div>
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
