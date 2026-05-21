import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, ChevronDown, Search } from 'lucide-react';

// Custom 4-dot drag handle (2×2 grid)
const DragHandle = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ pointerEvents: 'none' }}>
    <circle cx="3" cy="3" r="1.2" />
    <circle cx="7" cy="3" r="1.2" />
    <circle cx="3" cy="7" r="1.2" />
    <circle cx="7" cy="7" r="1.2" />
  </svg>
);

const LegendSymbol = ({ type, color }) => {
  if (type === 'point' || type === 'multipoint') return <div className="symbol-dot" style={{ backgroundColor: color }} />;
  if (type === 'polyline') return <div className="symbol-line" style={{ backgroundColor: color }} />;
  return <div className="symbol-square" style={{ borderColor: color, backgroundColor: `${color}22` }} />;
};

export const LayersPanel = ({
  t,
  mapView,
  layersConfig,
  layerPanelMode,
  setLayerPanelMode,
  activeLayerEdit,
  setActiveLayerEdit,
  layerStates,
  setLayerStates,
  updateLayerState,
  layerOrder,
  setLayerOrder,
  layerSearch,
  setLayerSearch,
  layerVisibility,
  setLayerVisibility,
  treeExpanded,
  setTreeExpanded,
  dragOverId,
  setDragOverId,
  dragInsertPositionState,
  setDragInsertPositionState,
  activeLayerMenu,
  setActiveLayerMenu,
  layerMenuTriggerRect,
  setLayerMenuTriggerRect,
  dynamicMapServerData,
  initialEffectsBackup,
  setInitialEffectsBackup,
  toggleLayer,
  toggleSubLayer,
  handleLayerAction,
  handleDragStart,
  handleDragOver,
  handleDrop,
  handleDragEnd
}) => {

  if (layerPanelMode === 'effects-layer') {
    const target = activeLayerEdit?.target;
    const fullId = activeLayerEdit ? (activeLayerEdit.subId !== null ? `${activeLayerEdit.layerId}_sub_${activeLayerEdit.subId}` : activeLayerEdit.layerId) : null;
    const state = fullId ? (layerStates[fullId] || { opacity: 1, labels: true, visible: true, renderer: true, activeEffect: null }) : { opacity: 1, labels: true, visible: true, renderer: true, activeEffect: null };
    
    const layerTitle = target?.title || layersConfig.find(l => l.id === activeLayerEdit?.layerId)?.title || 'Layer';

    const EFFECTS_CONFIG = [
      {
        id: 'bloom',
        title: 'Bloom',
        description: 'Create soft, glowing highlights on bright areas',
        icon: 'auto_awesome',
        effectString: 'bloom(3, 2px, 0.5)'
      },
      {
        id: 'shadow',
        title: 'Drop Shadow',
        description: 'Add elegant depth with a soft dark shadow',
        icon: 'layers',
        effectString: 'drop-shadow(3px 3px 5px #000000)'
      },
      {
        id: 'blur',
        title: 'Blur',
        description: 'Soften and defocus layer features smoothly',
        icon: 'blur_on',
        effectString: 'blur(6px)'
      },
      {
        id: 'brightness-contrast',
        title: 'Brightness & Contrast',
        description: 'Boost highlight luminosity and dynamic range',
        icon: 'brightness_6',
        effectString: 'brightness(120%) contrast(150%)'
      },
      {
        id: 'grayscale',
        title: 'Grayscale',
        description: 'Convert all layer colors to classic monochrome',
        icon: 'filter_b_and_w',
        effectString: 'grayscale(100%)'
      },
      {
        id: 'hue-rotate',
        title: 'Hue Rotate',
        description: 'Shift all layer hues by 90 degrees',
        icon: 'filter_tilt_shift',
        effectString: 'hue-rotate(90deg)'
      },
      {
        id: 'saturate',
        title: 'Saturate',
        description: 'Intensify layer colors for a vibrant view',
        icon: 'color_lens',
        effectString: 'saturate(200%)'
      },
      {
        id: 'invert',
        title: 'Invert',
        description: 'Invert all colors to create a negative effect',
        icon: 'invert_colors',
        effectString: 'invert(100%)'
      },
      {
        id: 'sepia',
        title: 'Sepia',
        description: 'Apply a nostalgic warm sepia tone overlay',
        icon: 'photo_filter',
        effectString: 'sepia(100%)'
      }
    ];

    const applyEffects = (activeEffectId) => {
      const view = mapView;
      if (!view || !activeLayerEdit) return;

      const { layerId, subId } = activeLayerEdit;
      
      let arcgisLayer = null;
      if (subId !== null) {
        const parentLayer = view.map.findLayerById(layerId);
        if (parentLayer && typeof parentLayer.findSublayerById === 'function') {
          const numericSubId = String(subId).includes('_sub_') ? parseInt(String(subId).split('_sub_')[1], 10) : parseInt(subId, 10);
          arcgisLayer = parentLayer.findSublayerById(numericSubId);
        } else if (parentLayer && parentLayer.sublayers) {
          arcgisLayer = parentLayer.sublayers.find(s => s.id === subId || s.id === parseInt(subId, 10));
        }
      }
      
      if (!arcgisLayer) {
        arcgisLayer = view.map.findLayerById(layerId);
      }

      if (!arcgisLayer) return;

      try {
        if (!activeEffectId) {
          arcgisLayer.effect = null;
        } else {
          const config = EFFECTS_CONFIG.find(e => e.id === activeEffectId);
          if (config) {
            arcgisLayer.effect = config.effectString;
          } else {
            arcgisLayer.effect = null;
          }
        }
      } catch (err) {
        console.error('Failed to apply ArcGIS layer effect:', err);
      }
    };

    const handleToggleEffect = (effectId, isChecked) => {
      const nextEffect = isChecked ? effectId : null;
      updateLayerState(fullId, { activeEffect: nextEffect });
      applyEffects(nextEffect);
    };

    const handleReset = () => {
      updateLayerState(fullId, { activeEffect: null });
      applyEffects(null);
    };

    const handleCancel = () => {
      const previousEffect = initialEffectsBackup?.activeEffect || null;
      updateLayerState(fullId, { activeEffect: previousEffect });
      applyEffects(previousEffect);
      setLayerPanelMode('layers');
    };

    return (
      <div className="tool-content-full" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="tool-fixed-header" style={{ borderBottom: 'none', paddingBottom: '0px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            onClick={handleCancel}
            style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', color: '#64748b', padding: 0, cursor: 'pointer' }}
          >
            <ChevronLeft size={18} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <h3 style={{ margin: 0, color: '#1a2f4d', fontSize: '14px', fontWeight: 'bold' }}>Effects</h3>
          </div>
          <button 
            onClick={handleReset}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '6px', borderRadius: '50%', transition: 'all 0.2s ease' }}
            title="Reset All"
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
              e.currentTarget.style.color = '#e63946';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#64748b';
            }}
          >
            <i className="material-icons" style={{ fontSize: '18px' }}>refresh</i>
          </button>
        </div>

        <div className="tool-scroll-body" style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {EFFECTS_CONFIG.map((effect) => {
              const isActive = state.activeEffect === effect.id;
              return (
                <div 
                  key={effect.id}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    padding: '8px 12px', 
                    borderRadius: '8px', 
                    border: isActive ? '1px solid #fecdd3' : '1px solid #f1f5f9', 
                    backgroundColor: isActive ? '#fff1f2' : '#ffffff',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer'
                  }}
                  onClick={() => handleToggleEffect(effect.id, !isActive)}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = '#f8fafc';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = '#ffffff';
                  }}
                >
                  <div 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      width: '30px', 
                      height: '30px', 
                      borderRadius: '6px', 
                      backgroundColor: isActive ? '#e63946' : '#f1f5f9',
                      color: isActive ? '#ffffff' : '#64748b',
                      marginRight: '10px',
                      transition: 'all 0.2s ease',
                      flexShrink: 0
                    }}
                  >
                    <i className="material-icons" style={{ fontSize: '16px' }}>{effect.icon}</i>
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, paddingRight: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: isActive ? '#be123c' : '#1a2f4d' }}>{effect.title}</span>
                    <span style={{ fontSize: '10.5px', color: isActive ? '#e11d48' : '#64748b', marginTop: '1px', lineHeight: '1.2' }}>{effect.description}</span>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <input 
                      type="checkbox" 
                      className="switch-sm switch-sm-red" 
                      checked={isActive}
                      onChange={(e) => handleToggleEffect(effect.id, e.target.checked)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="tool-fixed-footer" style={{ borderTop: 'none', padding: '16px 0 0 0', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: 'transparent' }}>
          <button 
            type="button" 
            onClick={handleCancel} 
            className="secondary-btn" 
            style={{ padding: '8px 24px', background: 'transparent', border: '1px solid #cbd5e1', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button 
            type="button" 
            onClick={() => setLayerPanelMode('layers')} 
            className="primary-btn" 
            style={{ padding: '8px 24px', cursor: 'pointer' }}
          >
            Apply
          </button>
        </div>
      </div>
    );
  }

  if (layerPanelMode === 'customize-layer') {
    const target = activeLayerEdit?.target;
    const fullId = activeLayerEdit ? (activeLayerEdit.subId !== null ? `${activeLayerEdit.layerId}_sub_${activeLayerEdit.subId}` : activeLayerEdit.layerId) : null;
    const state = fullId ? (layerStates[fullId] || { opacity: 1, labels: true, visible: true, renderer: true }) : { opacity: 1, labels: true, visible: true, renderer: true };

    return (
      <div className="tool-content-full">
        <div className="tool-fixed-header" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            onClick={() => setLayerPanelMode('layers')}
            style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', color: '#64748b', padding: 0, cursor: 'pointer' }}
          >
            <ChevronLeft size={18} />
          </button>
          <h3 style={{ margin: 0, color: '#1a2f4d', fontSize: '14px', fontWeight: 'bold' }}>Customize Layer</h3>
        </div>
        <div className="tool-scroll-body" style={{ padding: '0 16px' }}>
          <form id="customizeForm" onSubmit={(e) => {
            e.preventDefault();
            if (!target) return;
            const formData = new FormData(e.currentTarget);
            
            const symbologyType = formData.get('symbologyType');
            try {
              if (symbologyType === 'simple') {
                let symbol;
                const geometryType = target.geometryType;
                const color = formData.get('fillColor');
                const outlineColor = formData.get('outlineColor');
                const width = parseInt(formData.get('lineWidth')) || 1;
                const transparency = parseInt(formData.get('transparency')) || 0;
                const alpha = 1 - (transparency / 100);
                
                const hexToRgba = (hex, a) => {
                  const r = parseInt(hex.slice(1, 3), 16);
                  const g = parseInt(hex.slice(3, 5), 16);
                  const b = parseInt(hex.slice(5, 7), 16);
                  return `rgba(${r},${g},${b},${a})`;
                };

                if (geometryType === 'polygon' || geometryType === 'esriGeometryPolygon') {
                  symbol = {
                    type: "simple-fill",
                    color: hexToRgba(color, alpha),
                    style: formData.get('fillStyle') || 'solid',
                    outline: { color: outlineColor, width: width, style: formData.get('lineStyle') || 'solid' }
                  };
                } else if (geometryType === 'polyline' || geometryType === 'esriGeometryPolyline') {
                  symbol = {
                    type: "simple-line",
                    color: hexToRgba(outlineColor, alpha),
                    width: width,
                    style: formData.get('lineStyle') || 'solid'
                  };
                } else {
                  symbol = {
                    type: "simple-marker",
                    color: hexToRgba(color, alpha),
                    size: width * 4,
                    outline: { color: outlineColor, width: 1 }
                  };
                }
                target.renderer = { type: "simple", symbol: symbol };
              } else if (symbologyType === 'attribute') {
                const field = formData.get('attributeField');
                target.renderer = {
                  type: "unique-value",
                  field: field,
                  defaultSymbol: {
                    type: "simple-fill",
                    color: "gray",
                    outline: { width: 0.5, color: "white" }
                  },
                  uniqueValueInfos: []
                };
              }
            } catch (err) {
              console.error('Error applying renderer:', err);
            }
            
            setLayerPanelMode('layers');
          }}>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#64748b' }}>Symbology Type</label>
              <select name="symbologyType" defaultValue="simple" className="tool-select" style={{ width: '100%', boxSizing: 'border-box' }} onChange={(e) => {
                document.getElementById('simpleOptions').style.display = e.target.value === 'simple' ? 'block' : 'none';
                document.getElementById('attributeOptions').style.display = e.target.value === 'attribute' ? 'block' : 'none';
              }}>
                <option value="simple">Simple</option>
                <option value="attribute">Attribute</option>
              </select>
            </div>

            <div id="simpleOptions" style={{ paddingBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#64748b' }}>Color</label>
                  <input name="fillColor" type="color" defaultValue="#8b5cf6" className="tool-input" style={{ width: '100%', height: '36px', padding: '0', cursor: 'pointer', boxSizing: 'border-box' }} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#64748b' }}>Outline Color</label>
                  <input name="outlineColor" type="color" defaultValue="#bef264" className="tool-input" style={{ width: '100%', height: '36px', padding: '0', cursor: 'pointer', boxSizing: 'border-box' }} />
                </div>
              </div>
              
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#64748b' }}>Line Width</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input name="lineWidth" type="range" min="0" max="10" step="1" defaultValue={2} style={{ flex: 1, cursor: 'pointer' }} onChange={(e) => document.getElementById('lineWidthVal').value = e.target.value} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input id="lineWidthVal" type="number" defaultValue={2} min="0" max="10" className="tool-input" style={{ width: '68px', textAlign: 'center', padding: '0 8px' }} onChange={(e) => {
                      const input = document.querySelector('input[name="lineWidth"]');
                      if (input) input.value = e.target.value;
                    }} />
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>px</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#64748b' }}>Line Style</label>
                  <select name="lineStyle" defaultValue="solid" className="tool-select" style={{ width: '100%', boxSizing: 'border-box' }}>
                    <option value="solid">Solid</option>
                    <option value="dash">Dash</option>
                    <option value="dot">Dot</option>
                    <option value="dash-dot">Dash Dot</option>
                    <option value="none">None</option>
                  </select>
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#64748b' }}>Fill Style</label>
                  <select name="fillStyle" defaultValue="solid" className="tool-select" style={{ width: '100%', boxSizing: 'border-box' }}>
                    <option value="solid">Solid</option>
                    <option value="cross">Cross</option>
                    <option value="diagonal-cross">Diagonal Cross</option>
                    <option value="forward-diagonal">Forward Diagonal</option>
                    <option value="backward-diagonal">Backward Diagonal</option>
                    <option value="none">None</option>
                  </select>
                </div>
              </div>
            </div>

            <div id="attributeOptions" style={{ display: 'none', paddingBottom: '16px' }}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#64748b' }}>Pick an attribute to symbolize</label>
                <select name="attributeField" className="tool-select" style={{ width: '100%', boxSizing: 'border-box' }}>
                  <option value="PROJECT_CODE">PROJECT_CODE</option>
                  <option value="STATUS">STATUS</option>
                  <option value="TYPE">TYPE</option>
                </select>
              </div>
              
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#64748b' }}>Transparency</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input name="transparency" type="range" min="0" max="100" step="1" defaultValue={10} style={{ flex: 1, cursor: 'pointer' }} onChange={(e) => document.getElementById('transVal').value = e.target.value} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input id="transVal" type="number" defaultValue={10} min="0" max="100" className="tool-input" style={{ width: '68px', textAlign: 'center', padding: '0 8px' }} onChange={(e) => {
                      const input = document.querySelector('input[name="transparency"]');
                      if (input) input.value = e.target.value;
                    }} />
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>%</span>
                  </div>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#64748b' }}>Line Width</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input name="attrLineWidth" type="range" min="0" max="10" step="1" defaultValue={2} style={{ flex: 1, cursor: 'pointer' }} onChange={(e) => document.getElementById('attrLineWidthVal').value = e.target.value} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input id="attrLineWidthVal" type="number" defaultValue={2} min="0" max="10" className="tool-input" style={{ width: '68px', textAlign: 'center', padding: '0 8px' }} onChange={(e) => {
                      const input = document.querySelector('input[name="attrLineWidth"]');
                      if (input) input.value = e.target.value;
                    }} />
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>px</span>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
        <div className="tool-fixed-footer" style={{ borderTop: '1px solid #e2e8f0', padding: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: 'transparent' }}>
          <button type="button" onClick={() => setLayerPanelMode('layers')} className="secondary-btn" style={{ padding: '8px 24px', background: 'transparent', border: '1px solid #cbd5e1' }}>Cancel</button>
          <button type="submit" form="customizeForm" className="primary-btn" style={{ padding: '8px 24px' }}>Apply</button>
        </div>
      </div>
    );
  }

  const orderedLayers = layerOrder.map(id => layersConfig.find(l => l.id === id)).filter(Boolean);
  const filteredLayers = orderedLayers.filter(l =>
    l.title.toLowerCase().includes(layerSearch.toLowerCase())
  );
  const allVisible = filteredLayers.length > 0 && filteredLayers.every(l => layerVisibility[l.id]);

  const renderActionMenu = (id, subId = null) => {
    const fullId = subId !== null ? `${id}_sub_${subId}` : id;
    const state = layerStates[fullId] || { opacity: 1, labels: true, visible: true, renderer: true };

    if (!layerMenuTriggerRect) return null;

    const layer = layersConfig.find(l => l.id === id);
    const isMapServer = layer && layer.type === 'map-image';

    let hierarchyType = 'feature';
    if (subId === null) {
      if (isMapServer) {
        hierarchyType = 'root-group';
      } else {
        hierarchyType = 'feature';
      }
    } else {
      const mapData = dynamicMapServerData[id];
      const sublayerMeta = mapData?.metadata?.layers?.find(s => s.id === subId || s.id === parseInt(subId));
      const hasChildren = sublayerMeta && sublayerMeta.subLayerIds && sublayerMeta.subLayerIds.length > 0;
      if (hasChildren) {
        hierarchyType = 'group';
      } else {
        hierarchyType = 'feature';
      }
    }

    const isGroupType = hierarchyType === 'root-group' || hierarchyType === 'group';

    const menuWidth = 210;
    const menuHeight = isGroupType ? 120 : 130;

    let left = layerMenuTriggerRect.right - menuWidth;
    if (left < 10) {
      left = 10;
    } else if (left + menuWidth > window.innerWidth - 10) {
      left = window.innerWidth - menuWidth - 10;
    }

    const spaceBelow = window.innerHeight - layerMenuTriggerRect.bottom;
    const spaceAbove = layerMenuTriggerRect.top;
    const openUpward = spaceBelow < menuHeight && spaceAbove > spaceBelow;

    const posStyle = openUpward
      ? { bottom: `${window.innerHeight - layerMenuTriggerRect.top}px`, top: 'auto', left: `${left}px`, right: 'auto' }
      : { top: `${layerMenuTriggerRect.bottom}px`, bottom: 'auto', left: `${left}px`, right: 'auto' };

    return createPortal(
      <motion.div 
        className="layer-action-menu"
        initial={{ opacity: 0, scale: 0.95, y: openUpward ? 10 : -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          ...posStyle,
          zIndex: 99999,
          margin: 0
        }}
      >
        <div className="menu-item" onClick={() => handleLayerAction('zoom', id, subId)}>
          <i className="material-icons">zoom_out_map</i> Zoom to Full Extent
        </div>
        <div className="menu-item" onClick={() => handleLayerAction('zoomVisible', id, subId)}>
          <i className="material-icons">straighten</i> Zoom to Visible Scale
        </div>
        <div className="menu-divider" />
        <div className="menu-section">
          <div className="section-label">
            <i className="material-icons">opacity</i> Transparency
          </div>
          <div className="slider-container">
            <input 
              type="range" min="0" max="100" step="1" 
              value={Math.round(state.opacity * 100)} 
              onChange={(e) => {
                const val = parseInt(e.target.value, 10) / 100;
                updateLayerState(fullId, { opacity: val });
                const view = mapView;
                if (view) {
                  let target;
                  if (subId !== null) {
                    const p = view.map.findLayerById(id);
                    if (p) {
                      target = typeof p.findSublayerById === 'function'
                        ? p.findSublayerById(Number(subId))
                        : (p.sublayers ? p.sublayers.find(s => s.id === subId || s.id === parseInt(subId, 10)) : null);
                    }
                  } else {
                    target = view.map.findLayerById(id);
                  }
                  if (target) {
                    target.opacity = val;

                    const stateUpdatesObj = {};
                    if (subId !== null) {
                      const p = view.map.findLayerById(id);
                      const applySublayerOpacityRecursive = (parentLayer, sId, opacityValue) => {
                        const sublayer = typeof parentLayer.findSublayerById === 'function'
                          ? parentLayer.findSublayerById(Number(sId))
                          : (parentLayer.sublayers ? parentLayer.sublayers.find(s => s.id === sId || s.id === parseInt(sId, 10)) : null);
                        if (sublayer) {
                          sublayer.opacity = opacityValue;
                          const childFullId = `${parentLayer.id}_sub_${sId}`;
                          stateUpdatesObj[childFullId] = opacityValue;
                          if (sublayer.subLayerIds && sublayer.subLayerIds.length > 0) {
                            sublayer.subLayerIds.forEach(childId => {
                              applySublayerOpacityRecursive(parentLayer, childId, opacityValue);
                            });
                          }
                        }
                      };
                      applySublayerOpacityRecursive(p, subId, val);
                    } else {
                      if (target.sublayers && target.sublayers.length > 0) {
                        target.sublayers.forEach(sub => {
                          sub.opacity = val;
                          stateUpdatesObj[`${id}_sub_${sub.id}`] = val;
                        });
                      }
                    }

                    if (Object.keys(stateUpdatesObj).length > 0) {
                      setLayerStates(prev => {
                        const next = { ...prev };
                        Object.entries(stateUpdatesObj).forEach(([fid, opacityVal]) => {
                          next[fid] = {
                            ...(next[fid] || { opacity: 1, labels: true, visible: true, renderer: true }),
                            opacity: opacityVal
                          };
                        });
                        return next;
                      });
                    }
                  }
                }
              }}
            />
            <span>{Math.round(state.opacity * 100)}%</span>
          </div>
        </div>
        {!isGroupType && (
          <>
            <div className="menu-divider" />
            <div className="menu-item-toggle">
              <span><i className="material-icons">label</i> Labels</span>
              <input 
                type="checkbox" className="switch-sm" 
                checked={state.labels !== false}
                onChange={() => handleLayerAction('toggleLabels', id, subId)}
              />
            </div>
            {subId === null && (
              <div className="menu-item" onClick={() => handleLayerAction('effectsLayer', id, subId)}>
                <i className="material-icons">palette</i> Effects
              </div>
            )}
          </>
        )}
      </motion.div>,
      document.body
    );
  };

  return (
    <div className="tool-content" style={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="layer-search-container">
        <div className="search-container" style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input 
            type="text" 
            placeholder="Search layers..." 
            className="layer-search-input"
            value={layerSearch}
            onChange={(e) => setLayerSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="layer-select-all-row">
        <label className="layer-card-label">
          <input 
            type="checkbox" 
            className="custom-checkbox"
            checked={allVisible}
            onChange={(e) => {
              const checked = e.target.checked;
              const updates = {};
              filteredLayers.forEach(l => updates[l.id] = checked);
              setLayerVisibility(prev => ({ ...prev, ...updates }));
            }}
          />
          <span className="layer-card-name">Select all</span>
        </label>
        <button 
          className="layer-clear-btn"
          onClick={() => {
            const updates = {};
            filteredLayers.forEach(l => updates[l.id] = false);
            setLayerVisibility(prev => ({ ...prev, ...updates }));
          }}
        >
          Clear
        </button>
      </div>

      <div className="layer-list" style={{ flex: 1, overflowY: 'auto', padding: '4px' }} onClick={() => setActiveLayerMenu(null)} onScroll={() => setActiveLayerMenu(null)}>
        {filteredLayers.map(layer => {
          const isMapServer = layer.type === 'map-image';
          const isExpanded = treeExpanded[layer.id];
          const mapData = dynamicMapServerData[layer.id];

          return (
            <div 
              key={layer.id}
              className={`layer-tree-container ${dragOverId === layer.id ? `drag-over drag-insert-${dragInsertPositionState}` : ''}`}
              onDragOver={(e) => handleDragOver(e, layer.id)}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            >
              <div className={`layer-card ${layerVisibility[layer.id] ? 'active' : ''} ${isExpanded ? 'tree-active' : ''}`} style={{ zIndex: activeLayerMenu === layer.id ? 9999 : undefined }}>
                <div className="layer-card-main" style={{ zIndex: activeLayerMenu === layer.id ? 9999 : undefined }}>
                  <div className="layer-row-content">
                    <span 
                      className="layer-drag-handle" 
                      draggable
                      onDragStart={(e) => {
                        const row = e.currentTarget.closest('.layer-tree-container');
                        if (row) e.dataTransfer.setDragImage(row, 20, 20);
                        handleDragStart(e, layer.id);
                      }}
                    >
                      <DragHandle />
                    </span>
                    
                    <input 
                      type="checkbox" 
                      className="custom-checkbox"
                      checked={layerVisibility[layer.id]}
                      onChange={(e) => { e.stopPropagation(); toggleLayer(layer.id); }}
                    />

                    {isMapServer ? (
                      <button 
                        className={`layer-accordion-btn ${isExpanded ? 'expanded' : ''}`}
                        onClick={(e) => { e.stopPropagation(); setTreeExpanded(prev => ({ ...prev, [layer.id]: !prev[layer.id] })); }}
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    ) : <div style={{ width: 22 }} />}
                    
                    <span className="layer-card-name tree-label-root" title={layer.title}>{layer.title}</span>
                  </div>

                  <div className="layer-card-more" style={{ zIndex: activeLayerMenu === layer.id ? 9999 : undefined }}>
                    <button 
                      className={`more-btn ${activeLayerMenu === layer.id ? 'active' : ''}`}
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        const nextActive = activeLayerMenu === layer.id ? null : layer.id;
                        setActiveLayerMenu(nextActive);
                        if (nextActive) {
                          setLayerMenuTriggerRect(e.currentTarget.getBoundingClientRect());
                        } else {
                          setLayerMenuTriggerRect(null);
                        }
                      }}
                    >
                      <i className="material-icons">more_horiz</i>
                    </button>
                    {activeLayerMenu === layer.id && renderActionMenu(layer.id)}
                  </div>
                </div>
              </div>

              {isMapServer && isExpanded && mapData && (
                <div className="tree-children">
                  {mapData.metadata.layers.map(sub => {
                    if (sub.parentLayerId != null && sub.parentLayerId !== -1) return null;

                    const renderSub = (s, depth = 1) => {
                      const subId = `${layer.id}_sub_${s.id}`;
                      const subExpanded = treeExpanded[subId];
                      const hasChildren = s.subLayerIds && s.subLayerIds.length > 0;
                      const isVisible = layerVisibility[subId];

                      return (
                        <React.Fragment key={s.id}>
                          <div 
                            className={`tree-row ${depth > 1 ? 'nested' : ''} ${dragOverId === subId ? `drag-over drag-insert-${dragInsertPositionState}` : ''}`} 
                            style={{ zIndex: activeLayerMenu === subId ? 9999 : undefined }}
                            onDragOver={(e) => handleDragOver(e, { type: 'sublayer', rootId: layer.id, parentId: s.parentLayerId != null ? s.parentLayerId : -1, id: s.id })}
                            onDrop={handleDrop}
                            onDragEnd={handleDragEnd}
                          >
                            <div className="layer-row-content">
                              {[...Array(depth)].map((_, i) => (
                                <div key={i} className="tree-line-spacer">
                                  <div className="tree-line-v" />
                                  {i === depth - 1 && <div className="tree-line-h" />}
                                </div>
                              ))}
                              
                              <span 
                                className="layer-drag-handle" 
                                style={{ marginRight: '4px', display: 'flex', alignItems: 'center' }} 
                                draggable
                                onDragStart={(e) => {
                                  const row = e.currentTarget.closest('.tree-row');
                                  if (row) e.dataTransfer.setDragImage(row, 20, 20);
                                  handleDragStart(e, { type: 'sublayer', rootId: layer.id, parentId: s.parentLayerId != null ? s.parentLayerId : -1, id: s.id });
                                }}
                              >
                                <DragHandle />
                              </span>

                              <input 
                                type="checkbox" 
                                className="custom-checkbox"
                                checked={isVisible}
                                onChange={() => toggleSubLayer(layer.id, s.id, !isVisible)}
                              />

                              {hasChildren ? (
                                <button 
                                  className={`layer-accordion-btn ${subExpanded ? 'expanded' : ''}`}
                                  onClick={() => setTreeExpanded(prev => ({ ...prev, [subId]: !subExpanded }))}
                                >
                                  {subExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                              ) : (
                                <div className="tree-symbol-wrapper">
                                  <LegendSymbol 
                                    type={s.geometryType === 'esriGeometryPoint' ? 'point' : s.geometryType === 'esriGeometryPolyline' ? 'polyline' : 'polygon'} 
                                    color={s.id % 2 === 0 ? '#3b82f6' : '#1e3c72'} 
                                  />
                                </div>
                              )}

                              <span className={`tree-label ${hasChildren ? 'tree-label-category' : 'tree-label-leaf'}`}>
                                {s.name}
                              </span>
                            </div>

                            <div className="layer-card-more" style={{ zIndex: activeLayerMenu === subId ? 9999 : undefined }}>
                              <button 
                                className={`more-btn ${activeLayerMenu === subId ? 'active' : ''}`}
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  const nextActive = activeLayerMenu === subId ? null : subId;
                                  setActiveLayerMenu(nextActive);
                                  if (nextActive) {
                                    setLayerMenuTriggerRect(e.currentTarget.getBoundingClientRect());
                                  } else {
                                    setLayerMenuTriggerRect(null);
                                  }
                                }}
                              >
                                <i className="material-icons">more_horiz</i>
                              </button>
                              {activeLayerMenu === subId && renderActionMenu(layer.id, s.id)}
                            </div>
                          </div>
                          {hasChildren && subExpanded && s.subLayerIds.map(cid => {
                            const child = mapData.metadata.layers.find(l => l.id === cid);
                            return child ? renderSub(child, depth + 1) : null;
                          })}
                        </React.Fragment>
                      );
                    };
                    return renderSub(sub);
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {filteredLayers.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: '13px' }}>
          No layers found matching "{layerSearch}"
        </div>
      )}
    </div>
  );
};

export default LayersPanel;
