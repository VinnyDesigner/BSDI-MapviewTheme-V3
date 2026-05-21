import React, { useState, useRef, useEffect } from 'react';
import { 
  MousePointer2, Square, Hexagon, Maximize2, Map,
  ChevronDown, ChevronRight, ChevronLeft, Check, Folder, FileText, Layers
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';

// Import modular feature panel components
import NavigationPanel from '../components/NavigationPanel';
import MeasurePanel from '../components/MeasurePanel';
import DrawPanel from '../components/DrawPanel';
import AddDataPanel from '../components/AddDataPanel';
import PrintPanel from '../components/PrintPanel';
import ArcadePanel from '../components/ArcadePanel';
import TemporalFilterPanel from '../components/TemporalFilterPanel';
import DataRequestPanel from '../components/DataRequestPanel';
import BookmarkPanel from '../components/BookmarkPanel';
import CustomSelect from '../components/CustomSelect';
import LayersPanel from '../components/LayersPanel';
import TreeSelect from '../components/TreeSelect';

// ── Search Panel Component ──────────────────────────────────────────────────
export const SearchPanel = ({ t }) => (
  <div className="tool-content">
    <div className="search-box">
      <input type="text" placeholder={t('searchPlaceholder')} className="tool-input" />
      <button className="primary-btn">{t('searchBtn')}</button>
    </div>
    <p className="hint">{t('searchHint')}</p>
  </div>
);

// ── Basemap Panel Component ─────────────────────────────────────────────────
export const BasemapPanel = ({ basemaps, currentBasemap, setCurrentBasemap }) => (
  <div className="tool-content">
    <div className="basemap-gallery">
      {basemaps.map((bm) => (
        <div 
          key={bm.id} 
          className={`basemap-item ${currentBasemap === bm.id ? 'active' : ''}`}
          onClick={() => setCurrentBasemap(bm.id)}
        >
          <div className="basemap-thumbnail">
            <img 
              src={bm.thumbnail} 
              alt={bm.title} 
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "/assets/fallback.jpg";
              }}
            />
            {currentBasemap === bm.id && (
              <div className="active-overlay">
                <div className="check-mark">✓</div>
              </div>
            )}
          </div>
          <span className="basemap-title">{bm.title}</span>
        </div>
      ))}
    </div>
  </div>
);

// ── Identify Panel Component ────────────────────────────────────────────────
export const IdentifyPanel = ({ 
  t, 
  layersConfig, 
  layerVisibility, 
  dynamicMapServerData, 
  identifySettings, 
  setIdentifySettings,
  expandedIdentifyLayers,
  setExpandedIdentifyLayers,
  selectedIdentifyFeature,
  setSelectedIdentifyFeature,
  mapView
}) => {
  // Recursively build active layer tree structure
  const treeData = React.useMemo(() => {
    const tree = [];

    layersConfig.forEach(l => {
      // 1. Feature layers (flat)
      if (l.type === 'feature') {
        tree.push({
          id: l.id,
          title: l.title,
          type: 'feature',
          selectable: true,
          children: []
        });
      }
      // 2. MapServer layers (hierarchical)
      else if (l.type === 'map-image') {
        const mapData = dynamicMapServerData[l.id];
        if (mapData && mapData.metadata && mapData.metadata.layers) {
          const sublayers = mapData.metadata.layers;
          
          const buildNode = (sub) => {
            const subId = `${l.id}_sub_${sub.id}`;
            const hasChildren = sub.subLayerIds && sub.subLayerIds.length > 0;

            if (hasChildren) {
              const childrenNodes = [];
              sub.subLayerIds.forEach(childId => {
                const childSub = sublayers.find(s => s.id === childId);
                if (childSub) {
                  const childNode = buildNode(childSub);
                  if (childNode) {
                    childrenNodes.push(childNode);
                  }
                }
              });
              
              if (childrenNodes.length > 0) {
                return {
                  id: subId,
                  title: sub.name || sub.title,
                  type: 'group',
                  selectable: false,
                  children: childrenNodes
                };
              }
              return null;
            } else {
              return {
                id: subId,
                title: sub.name || sub.title,
                type: 'feature',
                selectable: true,
                children: []
              };
            }
          };

          const rootChildren = [];
          sublayers.forEach(sub => {
            if (sub.parentLayerId == null || sub.parentLayerId === -1) {
              const node = buildNode(sub);
              if (node) {
                rootChildren.push(node);
              }
            }
          });

          if (rootChildren.length > 0) {
            tree.push({
              id: l.id,
              title: l.title,
              type: 'root-group',
              selectable: false,
              children: rootChildren
            });
          }
        }
      }
    });

    return tree;
  }, [layersConfig, dynamicMapServerData]);

  // Handle selectedLayerId validation/auto-reset
  React.useEffect(() => {
    if (identifySettings.selectedLayerId !== 'all') {
      const findNode = (nodes, id) => {
        for (const n of nodes) {
          if (n.id === id) return true;
          if (n.children && n.children.length > 0) {
            if (findNode(n.children, id)) return true;
          }
        }
        return false;
      };
      
      if (!findNode(treeData, identifySettings.selectedLayerId)) {
        setIdentifySettings(prev => ({ ...prev, selectedLayerId: 'all' }));
      }
    }
  }, [treeData, identifySettings.selectedLayerId, setIdentifySettings]);

  return (
    <div className="tool-content">
      {!identifySettings.results ? (
        <>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>
              Select Layer
            </label>
            <TreeSelect
              value={identifySettings.selectedLayerId}
              onChange={(val) => setIdentifySettings(prev => ({ ...prev, selectedLayerId: val }))}
              treeData={treeData}
              showAllOption={true}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '12px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>
              Identify Mode
            </label>
            <div className="identify-modes-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              {[
                { id: 'point', label: 'Point', icon: <MousePointer2 size={18} /> },
                { id: 'rectangle', label: 'Rectangle', icon: <Square size={18} /> },
                { id: 'polygon', label: 'Polygon', icon: <Hexagon size={18} /> }
              ].map(m => (
                <button 
                  key={m.id}
                  className={`identify-mode-card ${identifySettings.mode === m.id ? 'active' : ''}`}
                  onClick={() => setIdentifySettings(prev => ({ ...prev, mode: m.id }))}
                >
                  <div className="mode-icon">{m.icon}</div>
                  <span className="mode-label">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="identify-instruction" style={{ textAlign: 'center', padding: '16px', color: '#64748b', fontSize: '13px', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1' }}>
            <div style={{ marginBottom: '4px', fontWeight: '600', color: '#1e3c72' }}>
              {identifySettings.mode === 'point' ? 'Map Click Active' : 'Drawing Active'}
            </div>
            {identifySettings.mode === 'point' 
              ? t('identifyHint') 
              : "Draw an area on the map to query features intersecting it."}
          </div>
        </>
      ) : (
        <div>
          <div 
            style={{ 
              position: 'sticky',
              top: '-16px',
              zIndex: 10,
              background: 'rgba(255,255,255,0.95)',
              backdropFilter: 'blur(8px)',
              marginLeft: '-16px',
              marginRight: '-16px',
              padding: '14px 16px 12px 16px',
              marginBottom: '12px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex', alignItems: 'center',
              cursor: 'pointer', color: '#1e3c72', fontWeight: 'bold', fontSize: '14px' 
            }} 
            onClick={() => {
              setIdentifySettings(prev => ({ ...prev, results: null }));
              setExpandedIdentifyLayers([]);
              setSelectedIdentifyFeature(null);
            }}
          >
            <ChevronLeft size={18} style={{ marginRight: '8px' }} />
            Results ({identifySettings.results.total || 0})
          </div>

          <div className="no-scrollbar">
            {(!identifySettings.results.grouped || Object.keys(identifySettings.results.grouped).length === 0) ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
                No features found at this location.
              </div>
            ) : (
              Object.entries(identifySettings.results.grouped).map(([layerId, features]) => {
                const layer = layersConfig.find(l => l.title === layerId || l.id === layerId);
                const isExpanded = expandedIdentifyLayers.includes(layerId);
                
                return (
                  <div key={layerId} style={{ 
                    border: '1px solid #e2e8f0', borderRadius: '8px', 
                    marginBottom: '8px', background: isExpanded ? '#f8fafc' : 'white', overflow: 'hidden' 
                  }}>
                    <button 
                      style={{ 
                        width: '100%', padding: '12px', display: 'flex', 
                        justifyContent: 'space-between', alignItems: 'center', 
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        textAlign: 'left'
                      }}
                      onClick={() => setExpandedIdentifyLayers(prev => 
                        isExpanded ? prev.filter(id => id !== layerId) : [...prev, layerId]
                      )}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ color: '#64748b', display: 'flex', alignItems: 'center' }}>
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </div>
                        <span style={{ fontWeight: '700', color: '#1a2f4d', fontSize: '13px' }}>
                          {layer ? layer.title : layerId}
                        </span>
                      </div>
                      <span style={{ 
                        background: '#e2e8f0', padding: '2px 8px', borderRadius: '12px', 
                        fontSize: '11px', fontWeight: 'bold', color: '#475569'
                      }}>
                        {features.length}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="feature-list no-scrollbar" style={{ 
                        padding: '12px', maxHeight: '400px', overflowY: 'auto'
                      }}>
                        {features.map((f, i) => (
                          <div key={i} className="identify-result-card" style={{ 
                            background: 'white', border: '1px solid #edf2f7', 
                            borderRadius: '8px', marginBottom: '12px', padding: '12px', 
                            boxShadow: '0 2px 6px rgba(0,0,0,0.02)', transition: 'all 0.2s ease'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #f7fafc', paddingBottom: '8px' }}>
                              <span style={{ fontWeight: 'bold', color: '#1e3c72', fontSize: '13px' }}>
                                {f.attributes[f.displayField] || 'Feature ' + (i + 1)}
                              </span>
                              <button 
                                className="action-icon-btn" 
                                title="Zoom To"
                                onClick={() => mapView.goTo({ target: f.geometry, zoom: 15 })}
                                style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', color: '#1e3c72', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '600' }}
                              >
                                <Maximize2 size={12} /> Zoom
                              </button>
                            </div>
                            <div className="attributes-grid" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {f.fields && f.fields.length > 0 ? (
                                f.fields.map(field => {
                                  const val = f.attributes[field.name];
                                  if (val === undefined || val === null) return null;
                                  
                                  let displayVal = String(val);
                                  if (field.type === 'date' || field.type === 'esriFieldTypeDate') {
                                    try {
                                      const date = new Date(val);
                                      displayVal = !isNaN(date.getTime()) ? date.toLocaleDateString() : String(val);
                                    } catch (e) {
                                      displayVal = String(val);
                                    }
                                  }
                                  
                                  return (
                                    <div key={field.name} style={{ display: 'flex', fontSize: '11px', borderBottom: '1px solid #f7fafc', padding: '4px 0', alignItems: 'center' }}>
                                      <span style={{ color: '#64748b', width: '45%', flexShrink: 0, fontWeight: '500' }}>{field.alias}</span>
                                      <span style={{ color: '#1e293b', fontWeight: '600', wordBreak: 'break-all' }}>{displayVal}</span>
                                    </div>
                                  );
                                })
                              ) : (
                                Object.entries(f.attributes).map(([key, val]) => (
                                  <div key={key} style={{ display: 'flex', fontSize: '11px', borderBottom: '1px solid #f7fafc', padding: '4px 0', alignItems: 'center' }}>
                                    <span style={{ color: '#64748b', width: '45%', flexShrink: 0, fontWeight: '500' }}>{key}</span>
                                    <span style={{ color: '#1e293b', fontWeight: '600', wordBreak: 'break-all' }}>{String(val)}</span>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div style={{ 
            position: 'sticky',
            bottom: '-16px',
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(8px)',
            marginLeft: '-16px',
            marginRight: '-16px',
            padding: '12px 16px 14px 16px',
            display: 'flex',
            justifyContent: 'flex-end'
          }}>
            <button 
              style={{ 
                fontSize: '13px',
                padding: '8px 18px',
                fontWeight: '600', 
                color: '#1e3c72',
                background: 'white',
                border: '1px solid #cbd5e1', 
                borderRadius: '8px',
                cursor: 'pointer', 
                boxShadow: '0 1px 4px rgba(0,0,0,0.07)', 
                transition: 'all 0.2s ease'
              }}
              onClick={() => {
                setIdentifySettings(prev => ({ ...prev, results: null }));
                setExpandedIdentifyLayers([]);
                setSelectedIdentifyFeature(null);
              }}
            >
              Clear Results
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Blend Panel Component ───────────────────────────────────────────────────
export const BlendPanel = ({ 
  basemaps, 
  blendSettings, 
  setBlendSettings, 
  setCurrentBasemap, 
  currentBasemap 
}) => {
  const basemapOptions = basemaps.map(bm => ({ id: bm.id, title: bm.title }));
  const isOverlaySelected = !!blendSettings.overlayLayerId;

  return (
    <div className="tool-content">
      <div className="form-group" style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>
          Base Layer (Background)
        </label>
        <CustomSelect 
          options={basemapOptions}
          value={blendSettings.baseLayerId}
          onChange={(val) => {
            setBlendSettings(prev => ({ ...prev, baseLayerId: val }));
            setCurrentBasemap(val); 
          }}
          placeholder="Select background imagery..."
        />
      </div>

      <div className="form-group" style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>
          Overlay Layer (Imagery)
        </label>
        <CustomSelect 
          options={basemapOptions.filter(bm => bm.id !== blendSettings.baseLayerId)}
          value={blendSettings.overlayLayerId}
          onChange={(val) => setBlendSettings(prev => ({ ...prev, overlayLayerId: val }))}
          placeholder="Select overlay imagery..."
        />
      </div>

      <div className="form-group" style={{ marginBottom: '12px', opacity: isOverlaySelected ? 1 : 0.5, pointerEvents: isOverlaySelected ? 'auto' : 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <label style={{ fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Opacity</label>
          <span style={{ fontWeight: '700', color: '#DF261C', fontSize: '13px' }}>{Math.round(blendSettings.opacity * 100)}%</span>
        </div>
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.01"
          value={blendSettings.opacity}
          disabled={!isOverlaySelected}
          onChange={(e) => setBlendSettings(prev => ({ ...prev, opacity: parseFloat(e.target.value) }))}
          style={{ 
            width: '100%', 
            accentColor: '#DF261C',
            cursor: isOverlaySelected ? 'pointer' : 'default'
          }}
        />
      </div>

      <div className="form-group" style={{ marginBottom: '12px', opacity: isOverlaySelected ? 1 : 0.5, pointerEvents: isOverlaySelected ? 'auto' : 'none' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>
          Blend Mode
        </label>
        <CustomSelect 
          options={[
            { id: 'normal', title: 'normal' },
            { id: 'multiply', title: 'multiply' },
            { id: 'screen', title: 'screen' },
            { id: 'overlay', title: 'overlay' },
            { id: 'darken', title: 'darken' },
            { id: 'lighten', title: 'lighten' },
            { id: 'soft-light', title: 'soft-light' },
            { id: 'hard-light', title: 'hard-light' },
            { id: 'color-burn', title: 'color-burn' },
            { id: 'color-dodge', title: 'color-dodge' }
          ]}
          value={blendSettings.blendMode}
          disabled={!isOverlaySelected}
          onChange={(val) => setBlendSettings(prev => ({ ...prev, blendMode: val }))}
          placeholder="Select blend mode..."
        />
      </div>
    </div>
  );
};

// ── Spatial Analysis Panel Component ─────────────────────────────────────────
export const SpatialAnalysisPanel = ({ 
  layersConfig, 
  spatialSettings, 
  setSpatialSettings 
}) => {
  return (
    <div className="tool-content-full">
      <div className="tool-scroll-body">
        <div className="form-group">
          <label>Select Analysis Tool</label>
          <CustomSelect 
            options={[
              "Buffer Analysis",
              "Select by Location",
              "Overlay (Intersect)",
              "Proximity (Nearest)",
              "Heatmap Density"
            ]}
            value={spatialSettings.subTool}
            onChange={(val) => setSpatialSettings({...spatialSettings, subTool: val})}
          />
        </div>

        <div className="form-group">
          <label>Target Layer</label>
          <CustomSelect 
            options={layersConfig}
            value={spatialSettings.layerId}
            onChange={(val) => setSpatialSettings({...spatialSettings, layerId: val})}
            placeholder="Select Layer..."
          />
        </div>

        {spatialSettings.subTool === 'Buffer Analysis' && (
          <div className="form-group">
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 2 }}>
                <label>Distance</label>
                <input 
                  type="number" 
                  className="tool-input" 
                  value={spatialSettings.bufferDistance}
                  onChange={(e) => setSpatialSettings({...spatialSettings, bufferDistance: Number(e.target.value)})}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label>Unit</label>
                <CustomSelect 
                  options={[
                    { label: 'm', value: 'meters' },
                    { label: 'km', value: 'kilometers' },
                    { label: 'mi', value: 'miles' }
                  ]}
                  value={spatialSettings.bufferUnit}
                  onChange={(val) => setSpatialSettings({...spatialSettings, bufferUnit: val})}
                />
              </div>
            </div>
          </div>
        )}

        {spatialSettings.subTool === 'Proximity (Nearest)' && (
          <div className="instruction-box">
            <span className="box-title">Instructions:</span>
            <p>Click any point on the map to find the nearest feature in the selected layer.</p>
          </div>
        )}

        <div className="form-group">
          <div className="info-box">
            <h4 className="info-title">Tool Info:</h4>
            <p className="info-text">
              {spatialSettings.subTool === 'Buffer Analysis' && "Creates a polygon around map features at a specified distance."}
              {spatialSettings.subTool === 'Select by Location' && "Filters features based on their spatial relationship with another layer."}
              {spatialSettings.subTool === 'Overlay (Intersect)' && "Identifies areas where two layers geographically overlap."}
              {spatialSettings.subTool === 'Proximity (Nearest)' && "Calculates the straight-line distance to the closest item."}
              {spatialSettings.subTool === 'Heatmap Density' && "Visualizes the geographic concentration of features."}
            </p>
          </div>
        </div>

        {spatialSettings.status && (
          <div className={`status-box ${spatialSettings.status.includes('Click') ? 'waiting' : 'success'}`}>
            {spatialSettings.status.includes('Click') ? '📍 ' : '✔ '} {spatialSettings.status}
          </div>
        )}

        {spatialSettings.distanceResult && (
          <div className="result-highlight-card">
            <span className="result-label">Nearest Distance</span>
            <span className="result-value">{spatialSettings.distanceResult}</span>
          </div>
        )}
      </div>

      <div className="tool-fixed-footer">
        <button 
          className="secondary-btn"
          onClick={() => setSpatialSettings({...spatialSettings, status: '', lastRun: null, distanceResult: null, isWaitingForClick: false})}
        >
          Clear
        </button>
        <button 
          className="primary-btn" 
          onClick={() => {
            const isProximity = spatialSettings.subTool === 'Proximity (Nearest)';
            setSpatialSettings({
              ...spatialSettings, 
              lastRun: Date.now(), 
              isWaitingForClick: isProximity,
              status: isProximity ? 'Ready: Click any point on the map' : `${spatialSettings.subTool} applied successfully`,
              distanceResult: null
            });
          }}
        >
          {spatialSettings.subTool === 'Proximity (Nearest)' ? 'Start Tracking' : 'Run Analysis'}
        </button>
      </div>
    </div>
  );
};

// ── Swipe/Split Panel Component ──────────────────────────────────────────────
export const SwipePanel = ({ 
  t, 
  layersConfig, 
  dynamicMapServerData, 
  splitLayers, 
  setSplitLayers, 
  basemaps, 
  splitBasemaps, 
  setSplitBasemaps,
  isSplitModePersistent, 
  setIsSplitModePersistent, 
  swipeMode, 
  setSwipeMode,
  showSplitBasemap,
  setShowSplitBasemap
}) => {
  const allIdentifyLayers = [];
  layersConfig.forEach(l => {
    if (l.type === 'feature') {
      allIdentifyLayers.push({ id: l.id, title: l.title });
    } else if (l.type === 'map-image' && dynamicMapServerData[l.id]) {
      const mapData = dynamicMapServerData[l.id];
      if (mapData.metadata.layers) {
        mapData.metadata.layers.forEach(sub => {
          allIdentifyLayers.push({ id: `${l.id}_sub_${sub.id}`, title: sub.name || sub.title });
        });
      }
    }
  });

  const splitOptionsList = [
    { id: 'all-visible', title: 'All Visible Layers' },
    ...allIdentifyLayers
  ];

  return (
    <div className="tool-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'rgba(30, 60, 114, 0.05)', borderRadius: '8px', marginBottom: '20px', border: '1px solid rgba(30, 60, 114, 0.1)' }}>
        <span style={{ fontWeight: '700', color: '#1a2f4d', fontSize: '14px' }}>
          {isSplitModePersistent ? 'Swipe Active' : 'Enable Swipe'}
        </span>
        <button 
          onClick={() => setIsSplitModePersistent(!isSplitModePersistent)}
          className="no-stroke-btn"
          style={{ background: isSplitModePersistent ? '#cbd5e1' : 'linear-gradient(135deg, #df261c, #002D5D)', color: isSplitModePersistent ? '#1a2f4d' : 'white', padding: '8px 18px', fontSize: '13px', fontWeight: '600', borderRadius: '10px', border: 'none', transition: 'all 0.3s ease', cursor: 'pointer' }}
        >
          {isSplitModePersistent ? 'Disable' : 'Enable'}
        </button>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Swipe Direction</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { id: 'vertical',   label: '| Vertical Swipe' },
            { id: 'horizontal', label: '— Horizontal Swipe' }
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setSwipeMode(id)}
              style={{ 
                flex: 1, 
                padding: '7px 0', 
                borderRadius: '6px', 
                border: '1.5px solid', 
                borderColor: swipeMode === id ? '#3b82f6' : '#e2e8f0', 
                background: swipeMode === id ? 'linear-gradient(135deg, #f0f7ff, #e0efff)' : 'white', 
                color: swipeMode === id ? '#1e3c72' : '#64748b', 
                fontWeight: '700', 
                fontSize: '11px', 
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d' }}>{t('splitLeftLayer')}</label>
        <div style={{ display: 'flex', gap: '8px', position: 'relative', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <CustomSelect 
              options={splitOptionsList}
              value={splitLayers.left} 
              onChange={(val) => setSplitLayers(prev => ({ ...prev, left: val }))}
              placeholder="Select left layers..."
              multi={true}
            />
          </div>
          <button 
            className={`basemap-toggle-btn ${showSplitBasemap.left ? 'active' : ''}`}
            onClick={() => setShowSplitBasemap(prev => ({ ...prev, left: !prev.left, right: false }))}
            title="Change Basemap"
          >
            <Map size={16} />
          </button>

          {showSplitBasemap.left && (
            <div className="split-basemap-popup left">
              {basemaps.map(bm => (
                <div 
                  key={bm.id} 
                  className={`split-bm-item ${splitBasemaps.left === bm.id ? 'active' : ''}`}
                  onClick={() => { setSplitBasemaps(prev => ({ ...prev, left: bm.id })); setShowSplitBasemap(prev => ({ ...prev, left: false })); }}
                >
                  {bm.title}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="form-group">
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d' }}>{t('splitRightLayer')}</label>
        <div style={{ display: 'flex', gap: '8px', position: 'relative', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <CustomSelect 
              options={splitOptionsList}
              value={splitLayers.right} 
              onChange={(val) => setSplitLayers(prev => ({ ...prev, right: val }))}
              placeholder="Select right layers..."
              multi={true}
            />
          </div>
          <button 
            className={`basemap-toggle-btn ${showSplitBasemap.right ? 'active' : ''}`}
            onClick={() => setShowSplitBasemap(prev => ({ ...prev, right: !prev.right, left: false }))}
            title="Change Basemap"
          >
            <Map size={16} />
          </button>

          {showSplitBasemap.right && (
            <div className="split-basemap-popup right">
              {basemaps.map(bm => (
                <div 
                  key={bm.id} 
                  className={`split-bm-item ${splitBasemaps.right === bm.id ? 'active' : ''}`}
                  onClick={() => { setSplitBasemaps(prev => ({ ...prev, right: bm.id })); setShowSplitBasemap(prev => ({ ...prev, right: false })); }}
                >
                  {bm.title}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Split View Panel Component ──────────────────────────────────────────────
export const SplitViewPanel = ({ 
  layersConfig, 
  dynamicMapServerData, 
  isSplitView, 
  setIsSplitView, 
  isSplitModePersistent, 
  setIsSplitModePersistent, 
  splitLayers, 
  setSplitLayers, 
  basemaps, 
  splitBasemaps, 
  setSplitBasemaps, 
  splitModes, 
  setSplitModes, 
  syncMode, 
  setSyncMode,
  showSplitBasemap, 
  setShowSplitBasemap 
}) => {
  const allIdentifyLayersView = [];
  layersConfig.forEach(l => {
    if (l.type === 'feature') {
      allIdentifyLayersView.push({ id: l.id, title: l.title });
    } else if (l.type === 'map-image' && dynamicMapServerData[l.id]) {
      const mapData = dynamicMapServerData[l.id];
      if (mapData.metadata.layers) {
        mapData.metadata.layers.forEach(sub => {
          allIdentifyLayersView.push({ id: `${l.id}_sub_${sub.id}`, title: sub.name || sub.title });
        });
      }
    }
  });

  const splitViewOptionsList = [
    { id: 'all-visible', title: 'All Visible Layers' },
    ...allIdentifyLayersView
  ];

  return (
    <div className="tool-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'rgba(30, 60, 114, 0.05)', borderRadius: '8px', marginBottom: '16px', border: '1px solid rgba(30, 60, 114, 0.1)' }}>
        <span style={{ fontWeight: '700', color: '#1a2f4d', fontSize: '14px' }}>
          {isSplitView ? 'Split View Active' : 'Enable Split View'}
        </span>
        <button 
          onClick={() => { setIsSplitView(!isSplitView); if (isSplitModePersistent) setIsSplitModePersistent(false); }}
          className="no-stroke-btn"
          style={{ background: isSplitView ? '#cbd5e1' : 'linear-gradient(135deg, #df261c, #002D5D)', color: isSplitView ? '#1a2f4d' : 'white', padding: '8px 18px', fontSize: '13px', fontWeight: '600', borderRadius: '10px', border: 'none', cursor: 'pointer' }}
        >
          {isSplitView ? 'Disable' : 'Enable'}
        </button>
      </div>

      {/* Left Side Controls */}
      <div className="form-group" style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#1a2f4d' }}>Left Side</label>
        <div style={{ display: 'flex', gap: '8px', position: 'relative', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <CustomSelect
              options={splitViewOptionsList}
              value={splitLayers.left}
              onChange={(val) => setSplitLayers(prev => ({ ...prev, left: val }))}
              placeholder="Select left layers..."
              multi={true}
            />
          </div>
          <button 
            className={`basemap-toggle-btn ${showSplitBasemap.left ? 'active' : ''}`}
            onClick={() => setShowSplitBasemap(prev => ({ ...prev, left: !prev.left, right: false }))}
            title="Change Basemap"
          >
            <Map size={16} />
          </button>
          <button 
            className="view-mode-single-btn"
            onClick={() => setSplitModes(prev => ({ ...prev, left: prev.left === '2D' ? '3D' : '2D' }))}
            style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px', minWidth: '40px', fontSize: '12px', fontWeight: '800', color: '#1a2f4d', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
          >
            {splitModes.left === '2D' ? '3D' : '2D'}
          </button>

          {showSplitBasemap.left && (
            <div className="split-basemap-popup left">
              {basemaps.map(bm => (
                <div 
                  key={bm.id} 
                  className={`split-bm-item ${splitBasemaps.left === bm.id ? 'active' : ''}`}
                  onClick={() => { setSplitBasemaps(prev => ({ ...prev, left: bm.id })); setShowSplitBasemap(prev => ({ ...prev, left: false })); }}
                >
                  {bm.title}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Side Controls */}
      <div className="form-group" style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#1a2f4d' }}>Right Side</label>
        <div style={{ display: 'flex', gap: '8px', position: 'relative', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <CustomSelect
              options={splitViewOptionsList}
              value={splitLayers.right}
              onChange={(val) => setSplitLayers(prev => ({ ...prev, right: val }))}
              placeholder="Select right layers..."
              multi={true}
            />
          </div>
          <button 
            className={`basemap-toggle-btn ${showSplitBasemap.right ? 'active' : ''}`}
            onClick={() => setShowSplitBasemap(prev => ({ ...prev, right: !prev.right, left: false }))}
            title="Change Basemap"
          >
            <Map size={16} />
          </button>
          <button 
            className="view-mode-single-btn"
            onClick={() => setSplitModes(prev => ({ ...prev, right: prev.right === '2D' ? '3D' : '2D' }))}
            style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px', minWidth: '40px', fontSize: '12px', fontWeight: '800', color: '#1a2f4d', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
          >
            {splitModes.right === '2D' ? '3D' : '2D'}
          </button>
        </div>

        {showSplitBasemap.right && (
          <div className="split-basemap-popup right">
            {basemaps.map(bm => (
              <div 
                key={bm.id} 
                className={`split-bm-item ${splitBasemaps.right === bm.id ? 'active' : ''}`}
                onClick={() => { setSplitBasemaps(prev => ({ ...prev, right: bm.id })); setShowSplitBasemap(prev => ({ ...prev, right: false })); }}
              >
                {bm.title}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="form-group" style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Extent Synchronization</label>
        <CustomSelect
          options={[
            { value: 'both', title: 'Sync Both Views (pan + zoom)' },
            { value: 'zoom', title: 'Sync Zoom Only' },
            { value: 'none', title: 'Independent Views' }
          ]}
          value={syncMode}
          onChange={(val) => setSyncMode(val)}
          placeholder="Select sync mode..."
        />
      </div>
    </div>
  );
};

// ── Central Dynamic PANEL MAPPING REGISTRY ──────────────────────────────────
export const PANEL_REGISTRY = {
  // Built-in modular React panels
  navigation: NavigationPanel,
  measure: MeasurePanel,
  draw: DrawPanel,
  add_data: AddDataPanel,
  print: PrintPanel,
  arcade: ArcadePanel,
  time_compare: TemporalFilterPanel,
  data_request: DataRequestPanel,
  bookmark: BookmarkPanel,
  layers: LayersPanel,

  // Custom inline layouts compiled as React elements
  search: SearchPanel,
  basemap: BasemapPanel,
  identify: IdentifyPanel,
  blend: BlendPanel,
  spatial_analysis: SpatialAnalysisPanel,
  split: SwipePanel,
  split_view: SplitViewPanel
};

export const getPanelComponent = (toolId) => {
  return PANEL_REGISTRY[toolId] || null;
};
