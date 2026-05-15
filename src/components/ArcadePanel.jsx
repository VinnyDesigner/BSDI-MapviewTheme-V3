import React, { useState, useEffect, useRef } from 'react';
import { 
  Code, 
  Layers, 
  Zap, 
  Plus, 
  Trash2, 
  Play, 
  RotateCcw, 
  Info,
  Bug,
  ChevronDown,
  Terminal,
  Variable,
  AlertCircle,
  CheckCircle2,
  Database,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CustomSelect from './CustomSelect';
import './ArcadePanel.css';

const ArcadePanel = ({ 
  view, 
  layersConfig, 
  settings, 
  onSettingsChange 
}) => {
  const [activeTab, setActiveTab] = useState('editor');
  const [cursorPos, setCursorPos] = useState(0);
  const [operationalLayers, setOperationalLayers] = useState([]);
  const [dynamicFields, setDynamicFields] = useState([]);
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  const editorRef = useRef(null);

  useEffect(() => {
    if (!view) return;

    const extractLayers = () => {
      const allLayers = [];
      
      view.map.layers.forEach(layer => {
        if (layer.type === 'feature' || layer.type === 'geojson' || layer.type === 'csv' || layer.type === 'graphics') {
          allLayers.push({
            id: layer.id,
            title: layer.title || layer.id,
            value: layer.id
          });
        } 
        else if (layer.type === 'map-image' && layer.sublayers) {
          // Add operational sublayers from MapServer
          layer.sublayers.forEach(sub => {
            if (sub.sublayers) {
              // Group layer - traverse deeper
              sub.sublayers.forEach(inner => {
                allLayers.push({
                  id: `${layer.id}_${inner.id}`,
                  title: `${inner.title}`,
                  value: `${layer.id}_${inner.id}`
                });
              });
            } else {
              allLayers.push({
                id: `${layer.id}_${sub.id}`,
                title: `${sub.title}`,
                value: `${layer.id}_${sub.id}`
              });
            }
          });
        }
      });

      // If no layers found in map, fallback to layersConfig
      if (allLayers.length === 0) {
        return layersConfig.map(l => ({ id: l.id, title: l.title, value: l.id }));
      }

      return allLayers;
    };

    setOperationalLayers(extractLayers());
  }, [view, layersConfig]);

  // Dynamic Field Fetching
  useEffect(() => {
    if (!view || !settings.layerId) return;

    const fetchFields = async () => {
      setIsLoadingFields(true);
      try {
        let targetLayer = null;
        const id = settings.layerId;

        if (id.includes('_')) {
          const [parentId, subId] = id.split('_');
          const parent = view.map.layers.find(l => l.id === parentId);
          if (parent && parent.type === 'map-image') {
            const sub = parent.findSublayerById(parseInt(subId));
            if (sub) {
              // Fetch fields from sublayer metadata
              const response = await fetch(`${parent.url}/${sub.id}?f=pjson`);
              const data = await response.json();
              if (data.fields) {
                const fields = data.fields.map(f => ({
                  label: `$feature.${f.name}`,
                  value: `$feature.${f.name}`
                }));
                setDynamicFields(fields);
              }
            }
          }
        } else {
          targetLayer = view.map.layers.find(l => l.id === id);
          if (targetLayer) {
            await targetLayer.when();
            const fields = targetLayer.fields.map(f => ({
              label: `$feature.${f.name}`,
              value: `$feature.${f.name}`
            }));
            setDynamicFields(fields);
          }
        }
      } catch (err) {
        console.error("Error fetching fields:", err);
        // Fallback to common fields
        setDynamicFields(commonFields);
      } finally {
        setIsLoadingFields(false);
      }
    };

    fetchFields();
  }, [view, settings.layerId]);

  const templates = [
    { name: 'Population Density', expression: 'return $feature.population / $feature.area;' },
    { name: 'Highlight Coastal', expression: "return When($feature.type == 'Coastal', 'High', 'Low');" },
    { name: 'Conditional Label', expression: "if ($feature.status == 1) {\n  return 'Active';\n} else {\n  return 'Inactive';\n}" },
    { name: 'Percentage Growth', expression: "return (($feature.current - $feature.previous) / $feature.previous) * 100;" },
    { name: 'Distance Calculation', expression: "return Distance($feature, Point({x: 50.5, y: 26.1, spatialReference: {wkid: 4326}}), 'meters');" }
  ];

  const commonFields = [
    { label: '$feature.name', value: '$feature.name' },
    { label: '$feature.type', value: '$feature.type' },
    { label: '$feature.area', value: '$feature.area' },
    { label: '$feature.population', value: '$feature.population' },
    { label: '$feature.status', value: '$feature.status' }
  ];

  // Insert field at cursor
  const handleInsertField = (field) => {
    if (!editorRef.current) return;
    const start = editorRef.current.selectionStart;
    const end = editorRef.current.selectionEnd;
    const text = editorRef.current.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    const newText = before + field + after;
    
    onSettingsChange({ ...settings, expression: newText });
    
    // Reset cursor after state update
    setTimeout(() => {
      editorRef.current.focus();
      editorRef.current.setSelectionRange(start + field.length, start + field.length);
    }, 0);
  };

  const handleTemplateSelect = (val) => {
    const template = templates.find(t => t.name === val);
    if (template) {
      onSettingsChange({ 
        ...settings, 
        template: val, 
        expression: template.expression 
      });
    }
  };

  const handleReset = () => {
    onSettingsChange({
      applyTo: 'Styling',
      layerId: layersConfig[0]?.id || '',
      template: '',
      expression: '',
      preview: 'Enter expression to see preview',
      debugInfo: null,
      showDebug: false,
      lastRun: null
    });
  };

  const handleApply = () => {
    onSettingsChange({ ...settings, lastRun: Date.now() });
  };

  return (
    <div className="arcade-panel-container">
      <div className="arcade-scroll-content">
        {/* Header Controls */}
        <div className="arcade-grid-row">
          <div className="form-group flex-1">
            <label className="input-label">Apply To</label>
            <CustomSelect 
              options={['Styling', 'Labels', 'Popup', 'Filtering']}
              value={settings.applyTo}
              onChange={(val) => onSettingsChange({ ...settings, applyTo: val })}
              placeholder="Select"
            />
          </div>
          <div className="form-group flex-1">
            <label className="input-label">Target Layer</label>
            <CustomSelect 
              options={operationalLayers}
              value={settings.layerId}
              onChange={(val) => onSettingsChange({ ...settings, layerId: val })}
              placeholder="Select layer"
            />
          </div>
        </div>

        <div className="form-group">
          <label className="input-label">Quick Templates</label>
          <CustomSelect 
            options={templates.map(t => t.name)}
            value={settings.template}
            onChange={handleTemplateSelect}
            placeholder="Choose a template..."
          />
        </div>

        {/* Field Picker */}
        <div className="field-picker-section">
          <div className="section-header">
            <Database size={14} className="icon" />
            <span>Field Picker</span>
          </div>
          <div className="field-chips">
            {isLoadingFields ? (
              <div className="fields-loading">
                <RefreshCw size={14} className="animate-spin" />
                <span>Fetching layer fields...</span>
              </div>
            ) : dynamicFields.length > 0 ? (
              dynamicFields.map(field => (
                <button 
                  key={field.value}
                  className="field-chip"
                  onClick={() => handleInsertField(field.value)}
                >
                  {field.label}
                </button>
              ))
            ) : (
              commonFields.map(field => (
                <button 
                  key={field.value}
                  className="field-chip"
                  onClick={() => handleInsertField(field.value)}
                >
                  {field.label}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Editor Section */}
        <div className="editor-section">
          <div className="section-header">
            <Code size={14} className="icon" />
            <span>Expression Editor</span>
          </div>
          <textarea 
            ref={editorRef}
            className="arcade-editor"
            value={settings.expression}
            onChange={(e) => onSettingsChange({ ...settings, expression: e.target.value })}
            placeholder="Write your Arcade expression here..."
            spellCheck="false"
          />
        </div>

        {/* Preview & Debug */}
        <div className="arcade-preview-card">
          <div className="preview-header">
            <div className="preview-status">
              {settings.preview.includes('Error') ? (
                <AlertCircle size={14} className="error-icon" />
              ) : (
                <CheckCircle2 size={14} className="success-icon" />
              )}
              <span>Output Preview</span>
            </div>
            <button 
              className="debug-toggle"
              onClick={() => onSettingsChange({ ...settings, showDebug: !settings.showDebug })}
            >
              <Bug size={14} />
              {settings.showDebug ? 'Hide Debug' : 'Show Debug'}
            </button>
          </div>
          
          <div className={`preview-value ${settings.preview.includes('Error') ? 'error' : ''}`}>
            {settings.preview}
          </div>

          <AnimatePresence>
            {settings.showDebug && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="debug-panel"
              >
                <div className="debug-header">
                  <Terminal size={12} />
                  <span>Execution Logs</span>
                </div>
                <div className="debug-content">
                  {settings.debugInfo ? (
                    <pre>{JSON.stringify(settings.debugInfo, null, 2)}</pre>
                  ) : (
                    <div className="debug-placeholder">No execution logs available</div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Arcade Guide */}
        <div className="arcade-guide-card">
          <div className="guide-header">
            <Info size={14} />
            <span>Arcade Syntax Tips</span>
          </div>
          <ul className="guide-list">
            <li>Use <code>$feature.fieldname</code> to access attributes.</li>
            <li>Use <code>When()</code> for complex conditional styling.</li>
            <li>Always include a <code>return</code> statement.</li>
          </ul>
        </div>
      </div>

      {/* Fixed Footer */}
      <div className="arcade-footer">
        <button className="reset-btn" onClick={handleReset}>
          <RotateCcw size={16} /> Reset
        </button>
        <button 
          className="apply-btn" 
          onClick={handleApply}
          disabled={!settings.expression.trim()}
        >
          <Play size={16} /> Apply Expression
        </button>
      </div>
    </div>
  );
};

export default ArcadePanel;
