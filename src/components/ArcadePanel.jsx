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
  Database
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
  const editorRef = useRef(null);

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
            />
          </div>
          <div className="form-group flex-1">
            <label className="input-label">Target Layer</label>
            <CustomSelect 
              options={layersConfig}
              value={settings.layerId}
              onChange={(val) => onSettingsChange({ ...settings, layerId: val })}
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
            {commonFields.map(field => (
              <button 
                key={field.value}
                className="field-chip"
                onClick={() => handleInsertField(field.value)}
              >
                {field.label}
              </button>
            ))}
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
