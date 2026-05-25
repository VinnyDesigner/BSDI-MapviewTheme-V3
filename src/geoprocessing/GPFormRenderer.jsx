/**
 * GPFormRenderer
 * ──────────────────────────────────────────────────────────────────────────
 * Dynamically renders an input form for any GP tool from its parameter
 * descriptor array. No hardcoded fields — fully metadata-driven.
 *
 * Supported widgetTypes (Factory pattern):
 *   NumberInput   → <input type="number">
 *   TextInput     → <input type="text">
 *   TextArea      → <textarea>
 *   Select        → <CustomSelect> (reuses project's existing component)
 *   Toggle        → styled checkbox toggle
 *   DatePicker    → <input type="date">
 *   LayerPicker   → <TreeSelect> (reuses project's existing component)
 *   RasterPicker  → text input for URL
 *   FileUpload    → <input type="file">
 *   MultiInput    → repeating row of the inner widget type
 */

import React, { useState } from 'react';
import CustomSelect from '../components/CustomSelect';
import TreeSelect from '../components/TreeSelect';
import { useLanguage } from '../context/LanguageContext';

// ── Widget factory map ──────────────────────────────────────────────────────
const WIDGET_FACTORY = {
  NumberInput:  NumberInputWidget,
  TextInput:    TextInputWidget,
  TextArea:     TextAreaWidget,
  Select:       SelectWidget,
  Toggle:       ToggleWidget,
  DatePicker:   DatePickerWidget,
  LayerPicker:  LayerPickerWidget,
  RasterPicker: TextInputWidget,   // URL fallback
  FileUpload:   FileUploadWidget,
  MultiInput:   MultiInputWidget,
};

// ── Main component ──────────────────────────────────────────────────────────

/**
 * @param {Object} props
 * @param {Object[]}  props.params      – normalised parameter descriptors
 * @param {Object}    props.values      – current form values { name: value }
 * @param {Function}  props.onChange    – (name, value) => void
 * @param {Object}    props.treeData    – layer tree for LayerPicker widgets
 */
const GPFormRenderer = ({ params, values, onChange, treeData = [] }) => {
  const { t } = useLanguage();
  const inputParams = params.filter(p => p.direction !== 'esriGPParameterDirectionOutput');

  // Group by category
  const grouped = {};
  inputParams.forEach(p => {
    const cat = p.category || '';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(p);
  });

  return (
    <div className="gp-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {Object.entries(grouped).map(([category, catParams]) => (
        <div key={category} className="gp-form-category">
          {category && (
            <div className="gp-category-label">{category}</div>
          )}
          {catParams.map(param => (
            <div key={param.name} className="gp-form-field" style={{ marginBottom: 0 }}>
              <label className="gp-field-label">
                {t(param.label)}
                {param.required && <span className="gp-required-star">*</span>}
              </label>
              {param.description && (
                <p className="gp-field-desc">{t(param.description)}</p>
              )}
              <ParamWidget
                param={param}
                value={values[param.name] ?? param.defaultValue ?? ''}
                onChange={(val) => onChange(param.name, val)}
                treeData={treeData}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

// ── Widget dispatcher ───────────────────────────────────────────────────────

function ParamWidget({ param, value, onChange, treeData }) {
  const { t } = useLanguage();
  const Widget = WIDGET_FACTORY[param.widgetType] || TextInputWidget;
  return <Widget param={param} value={value} onChange={onChange} treeData={treeData} t={t} />;
}

// ── Individual widget implementations ──────────────────────────────────────

function NumberInputWidget({ param, value, onChange, t }) {
  return (
    <input
      type="number"
      className="tool-input"
      value={value ?? ''}
      min={param.min}
      max={param.max}
      step={param.step ?? 'any'}
      placeholder={t(param.placeholder || param.label)}
      onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
    />
  );
}

function TextInputWidget({ param, value, onChange, t }) {
  return (
    <input
      type="text"
      className="tool-input"
      value={value ?? ''}
      placeholder={t(param.placeholder || param.label)}
      onChange={e => onChange(e.target.value)}
    />
  );
}

function TextAreaWidget({ param, value, onChange, t }) {
  return (
    <textarea
      className="tool-input gp-textarea"
      value={value ?? ''}
      placeholder={param.placeholder ? t(param.placeholder) : `${t(param.label)}…`}
      rows={param.rows || 5}
      onChange={e => onChange(e.target.value)}
      style={{ height: 'auto', minHeight: '80px', padding: '8px 12px', resize: 'vertical' }}
    />
  );
}

function SelectWidget({ param, value, onChange, t }) {
  const options = param.choiceList.map(c =>
    typeof c === 'string' ? { label: t(c), value: c } : { ...c, label: t(c.label || c.value) }
  );
  return (
    <CustomSelect
      options={options}
      value={value}
      onChange={onChange}
      placeholder={`${t('gpSelectPlaceholder')} ${t(param.label)}…`}
    />
  );
}

function ToggleWidget({ param, value, onChange, t }) {
  const checked = Boolean(value);
  return (
    <div className="gp-toggle-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`gp-toggle-btn ${checked ? 'active' : ''}`}
        style={{
          width: 40, height: 22, borderRadius: 11, border: 'none',
          background: checked ? '#002D5D' : '#cbd5e1',
          position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
          flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute', top: 3, left: checked ? 20 : 3,
          width: 16, height: 16, borderRadius: '50%', background: 'white',
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </button>
      <span style={{ fontSize: 12, color: '#64748b' }}>
        {checked ? t('gpYes') : t('gpNo')}
      </span>
    </div>
  );
}

function DatePickerWidget({ param, value, onChange, t }) {
  return (
    <input
      type="date"
      className="tool-input"
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
    />
  );
}

function LayerPickerWidget({ param, value, onChange, treeData, t }) {
  return (
    <TreeSelect
      treeData={treeData}
      value={value}
      onChange={onChange}
      placeholder={`${t('gpSelectPlaceholder')} ${t(param.label)}…`}
      showAllOption={false}
    />
  );
}

function FileUploadWidget({ param, value, onChange, t }) {
  return (
    <div>
      <input
        type="file"
        accept={param.accept || '*'}
        className="tool-input"
        style={{ padding: '7px 12px', fontSize: 12 }}
        onChange={e => onChange(e.target.files[0])}
      />
      {value?.name && (
        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#64748b' }}>
          📎 {value.name}
        </p>
      )}
    </div>
  );
}

function MultiInputWidget({ param, value, onChange, treeData, t }) {
  const items = Array.isArray(value) ? value : value ? [value] : [''];
  const innerType = param.innerWidgetType || 'TextInput';
  const InnerWidget = WIDGET_FACTORY[innerType] || TextInputWidget;

  const update = (index, val) => {
    const next = [...items];
    next[index] = val;
    onChange(next);
  };

  const addItem = () => onChange([...items, '']);
  const removeItem = (i) => onChange(items.filter((_, idx) => idx !== i));

  return (
    <div className="gp-multi-input" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1 }}>
            <InnerWidget
              param={{ ...param, widgetType: innerType }}
              value={item}
              onChange={val => update(i, val)}
              treeData={treeData}
              t={t}
            />
          </div>
          {items.length > 1 && (
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="action-btn delete-btn"
              style={{ padding: '6px', fontSize: 12, flexShrink: 0 }}
            >✕</button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="secondary-btn"
        style={{ padding: '5px 10px', fontSize: 11, alignSelf: 'flex-start' }}
      >
        {t('gpAddValue')}
      </button>
    </div>
  );
}

export default GPFormRenderer;
