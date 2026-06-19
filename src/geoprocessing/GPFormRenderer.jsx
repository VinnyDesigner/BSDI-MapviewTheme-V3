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
const GPFormRenderer = ({ params, values, onChange, treeData = [], view }) => {
  const { t } = useLanguage();

  const modifiedParameters = React.useMemo(() => {
    const nextParams = params.map(p => ({ ...p }));
    const dissolveFieldParam = nextParams.find(p => p.name === 'Dissolve_Field');
    const selectedInputLayerId = values.Input_Features;
    const selectedDissolveType = values.Dissolve_Type || 'none';

    // 1. Hide Dissolve Field if dissolve type is not 'by-field' / 'Field'
    let filteredParams = nextParams;
    const isDissolveFieldActive = selectedDissolveType === 'by-field' || selectedDissolveType === 'Field';
    if (!isDissolveFieldActive) {
      filteredParams = nextParams.filter(p => p.name !== 'Dissolve_Field');
    }

    // 2. Query fields for the selected layer to dynamically fill Dissolve Field choiceList
    if (selectedInputLayerId && dissolveFieldParam && view) {
      let targetLayer = null;
      if (view.map) {
        if (selectedInputLayerId.includes('_sub_')) {
          const [parentId, subId] = selectedInputLayerId.split('_sub_');
          const parent = view.map.findLayerById(parentId);
          if (parent && parent.allSublayers) {
            targetLayer = parent.allSublayers.find(s => s.id === parseInt(subId));
          }
        } else {
          targetLayer = view.map.findLayerById(selectedInputLayerId);
        }
      }

      let fields = [];
      if (targetLayer) {
        if (targetLayer.fields) {
          fields = targetLayer.fields.map(f => f.name);
        } else if (targetLayer.layer?.fields) {
          fields = targetLayer.layer.fields.map(f => f.name);
        } else if (targetLayer.graphics && targetLayer.graphics.length > 0) {
          const firstGraphic = targetLayer.graphics.getItemAt(0);
          if (firstGraphic && firstGraphic.attributes) {
            fields = Object.keys(firstGraphic.attributes);
          }
        }
      }

      if (fields.length > 0) {
        dissolveFieldParam.choiceList = fields;
      } else {
        dissolveFieldParam.choiceList = [];
      }
    }

    // 3. Handle Summarize Within "Field" (Summary Field) parameter
    const summaryFieldParam = nextParams.find(p => p.name === 'Field');
    const selectedSummaryLayerId = values.Summary_Layer;
    const selectedStatType = values.Statistics_Type || 'Count';

    if (summaryFieldParam) {
      if (selectedStatType === 'Count') {
        filteredParams = filteredParams.filter(p => p.name !== 'Field');
      } else {
        // Prevent manual entry: enforce Select widget type
        summaryFieldParam.widgetType = 'Select';
        summaryFieldParam.choiceList = [];

        if (selectedSummaryLayerId && view) {
          let targetLayer = null;
          if (view.map) {
            if (selectedSummaryLayerId.includes('_sub_')) {
              const [parentId, subId] = selectedSummaryLayerId.split('_sub_');
              const parent = view.map.findLayerById(parentId);
              if (parent && parent.allSublayers) {
                targetLayer = parent.allSublayers.find(s => s.id === parseInt(subId));
              }
            } else {
              targetLayer = view.map.findLayerById(selectedSummaryLayerId);
            }
          }

          const NUMERIC_FIELD_TYPES = ['small-integer', 'integer', 'single', 'double', 'long', 'number', 'oid'];
          let numericFields = [];
          if (targetLayer) {
            if (targetLayer.fields) {
              numericFields = targetLayer.fields
                .filter(f => NUMERIC_FIELD_TYPES.includes(f.type?.toLowerCase()))
                .map(f => f.name);
            } else if (targetLayer.layer?.fields) {
              numericFields = targetLayer.layer.fields
                .filter(f => NUMERIC_FIELD_TYPES.includes(f.type?.toLowerCase()))
                .map(f => f.name);
            } else if (targetLayer.graphics && targetLayer.graphics.length > 0) {
              const firstGraphic = targetLayer.graphics.getItemAt(0);
              if (firstGraphic && firstGraphic.attributes) {
                numericFields = Object.keys(firstGraphic.attributes).filter(key => {
                  const val = firstGraphic.attributes[key];
                  return typeof val === 'number';
                });
              }
            }
          }
          summaryFieldParam.choiceList = numericFields;
        }
      }
    }

    return filteredParams;
  }, [params, values.Input_Features, values.Dissolve_Type, values.Summary_Layer, values.Statistics_Type, view]);

  const inputParams = modifiedParameters.filter(p => p.direction !== 'esriGPParameterDirectionOutput');

  // Group by category
  const grouped = {};
  inputParams.forEach(p => {
    const cat = p.category || '';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(p);
  });

  const handleWidgetChange = (name, val) => {
    if (name === 'Statistics_Type' && val === 'Count') {
      onChange('Field', '');
    }
    if (name === 'Summary_Layer') {
      onChange('Field', '');
    }
    onChange(name, val);
  };

  return (
    <div className="gp-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {Object.entries(grouped).map(([category, catParams]) => {
        // Group fields into rows dynamically
        const rows = [];
        let i = 0;
        while (i < catParams.length) {
          const p1 = catParams[i];
          const p2 = catParams[i + 1];
          
          let shouldGroup = false;
          if (p2) {
            const n1 = p1.name;
            const n2 = p2.name;
            if (
              (n1 === 'Distance' && n2 === 'Unit') ||
              (n1 === 'Method' && n2 === 'Dissolve_Type') ||
              (n1 === 'Observer_Height' && n2 === 'Observer_Height_Unit') ||
              (n1 === 'Target_Height' && n2 === 'Target_Height_Unit') ||
              (n1 === 'Min_Distance' && n2 === 'Max_Distance') ||
              (n1 === 'Horizontal_Angle' && n2 === 'Vertical_Angle') ||
              (n1 === 'Distance_Unit' && n2 === 'Method') ||
              (n1 === 'Radius' && n2 === 'Intensity') ||
              (n1 === 'Color_Ramp' && n2 === 'Density_Method')
            ) {
              shouldGroup = true;
            }
          }

          if (shouldGroup) {
            rows.push({ type: 'row', fields: [p1, p2] });
            i += 2;
          } else {
            rows.push({ type: 'single', field: p1 });
            i++;
          }
        }

        return (
          <div key={category} className="gp-form-category" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {category && (
              <div className="gp-category-label" style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{category}</div>
            )}
            {rows.map((row, idx) => {
              if (row.type === 'single') {
                const param = row.field;
                return (
                  <div key={param.name} className="gp-form-field" style={{ marginBottom: 0 }}>
                    <label className="gp-field-label" title={t(param.label)} style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#1a2f4d', marginBottom: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                      {t(param.label)}
                      {param.required && <span className="gp-required-star" style={{ color: '#DF261C', marginLeft: '3px' }}>*</span>}
                    </label>
                    <ParamWidget
                      param={param}
                      value={values[param.name] ?? param.defaultValue ?? ''}
                      onChange={(val) => handleWidgetChange(param.name, val)}
                      treeData={treeData}
                    />
                  </div>
                );
              } else {
                return (
                  <div key={`row-${idx}`} style={{ display: 'flex', gap: '16px', width: '100%' }}>
                    {row.fields.map(param => (
                      <div key={param.name} className="gp-form-field" style={{ flex: 1, minWidth: 0, marginBottom: 0 }}>
                        <label className="gp-field-label" title={t(param.label)} style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#1a2f4d', marginBottom: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                          {t(param.label)}
                          {param.required && <span className="gp-required-star" style={{ color: '#DF261C', marginLeft: '3px' }}>*</span>}
                        </label>
                        <ParamWidget
                          param={param}
                          value={values[param.name] ?? param.defaultValue ?? ''}
                          onChange={(val) => handleWidgetChange(param.name, val)}
                          treeData={treeData}
                        />
                      </div>
                    ))}
                  </div>
                );
              }
            })}
          </div>
        );
      })}
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
  let placeholderText = `${t('Enter')} ${t(param.label)}`;
  if (param.name === 'Distance') {
    placeholderText = t('enterBufferDistance');
  }
  return (
    <input
      type="number"
      className="tool-input"
      value={value ?? ''}
      min={param.min}
      max={param.max}
      step={param.step ?? 'any'}
      placeholder={placeholderText}
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
  
  let placeholderStr = `${t('gpSelectPlaceholder')} ${t(param.label)}`;
  if (param.name === 'Unit' || param.name === 'Distance_Unit') {
    placeholderStr = t('selectDistanceUnit');
  } else if (param.name === 'Method') {
    placeholderStr = t('selectMethod');
  } else if (param.name === 'Dissolve_Type') {
    placeholderStr = t('selectDissolveType');
  } else if (param.name === 'Dissolve_Field') {
    placeholderStr = t('selectDissolveField');
  } else if (param.name === 'Field') {
    placeholderStr = t('selectSummaryField') || 'Select Summary Field';
  }

  return (
    <CustomSelect
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholderStr}
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
      placeholder={`${t('gpSelectPlaceholder')} ${t(param.label)}`}
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
