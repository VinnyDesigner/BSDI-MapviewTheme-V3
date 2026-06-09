import React, { useState, useRef, useEffect } from 'react';
import { 
  MousePointer2, Square, Hexagon, Maximize2, Map,
  ChevronDown, ChevronRight, ChevronLeft, Check, Folder, FileText, Layers,
  Eye, EyeOff, Download, Trash2, Database
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import * as XLSX from 'xlsx';
import shpwrite from '@mapbox/shp-write';
import { graphicsToGeoJSON, esriGeometryToGeoJSON, buildGeoJSON } from '../geoprocessing/crsUtils';

// Import modular feature panel components
import NavigationPanel from '../components/NavigationPanel';
import MeasurePanel from '../components/MeasurePanel';
import DrawPanel from '../components/DrawPanel';
import AddDataPanel from '../components/AddDataPanel';
import PrintPanel from '../components/PrintPanel';
import ArcadePanel from '../components/ArcadePanel';
import TemporalFilterPanel from '../components/TemporalFilterPanel';
import AdvancedQueryPanel from '../components/AdvancedQueryPanel';
import DataRequestPanel from '../components/DataRequestPanel';
import BookmarkPanel from '../components/BookmarkPanel';
import CustomSelect from '../components/CustomSelect';
import LayersPanel from '../components/LayersPanel';
import TreeSelect from '../components/TreeSelect';
import GPPanel from '../geoprocessing/GPPanel';
import ProjectDataPanel from '../components/ProjectDataPanel';
import { useLanguage } from '../context/LanguageContext';
import DEFAULT_MANIFESTS from '../geoprocessing/defaultManifests';
import GPFormRenderer from '../geoprocessing/GPFormRenderer';
import { toggleGPResultLayer, removeGPResultLayer } from '../geoprocessing/gpResultRenderer';

// Bahrain geometry safety guard
const isValidBahrainGeometry = (geom, view) => {
  if (!geom) return false;
  
  // Log the debug info as requested by the user
  console.log("Extent:", geom.extent);
  console.log("Spatial Reference:", geom.spatialReference);
  if (view) {
    console.log("Scale:", view.scale);
  }

  // Get extent or center
  let extent = geom.extent;
  if (!extent && geom.type === 'point') {
    extent = { xmin: geom.x, xmax: geom.x, ymin: geom.y, ymax: geom.y };
  }
  if (!extent) return true; // fallback
  
  const sr = geom.spatialReference;
  const isWebMercator = sr && (sr.wkid === 3857 || sr.wkid === 102100 || sr.latestWkid === 3857 || sr.latestWkid === 102100);
  
  if (isWebMercator) {
    // Web Mercator bounds for Bahrain: X: 5.4M to 5.8M, Y: 2.8M to 3.2M
    if (Math.abs(extent.xmin) < 1000 && Math.abs(extent.ymin) < 1000) return false;
    return extent.xmin >= 5400000 && extent.xmax <= 5800000 &&
           extent.ymin >= 2800000 && extent.ymax <= 3200000;
  } else {
    // WGS84 bounds for Bahrain: Longitude 49.5 to 51.5, Latitude 24.5 to 27.5
    if (Math.abs(extent.xmin) < 0.1 && Math.abs(extent.ymin) < 0.1) return false;
    return extent.xmin >= 49.5 && extent.xmax <= 51.5 &&
           extent.ymin >= 24.5 && extent.ymax <= 27.5;
  }
};

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
  mapView,
  treeData
}) => {
  const handleExportFeatures = (featuresList, exportTitle) => {
    try {
      if (!featuresList || featuresList.length === 0) {
        alert("No features to export.");
        return;
      }

      const geojsonFeatures = featuresList.map(f => ({
        type: 'Feature',
        geometry: esriGeometryToGeoJSON(f.geometry),
        properties: { ...(f.attributes || {}) }
      }));

      const firstSR = featuresList[0]?.geometry?.spatialReference || 4326;
      const geojson = buildGeoJSON(geojsonFeatures, firstSR);

      const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.geojson`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export GeoJSON:", err);
      alert("Failed to export GeoJSON: " + err.message);
    }
  };

  // Handle selectedLayerId validation/auto-reset
  React.useEffect(() => {
    if (identifySettings.selectedLayerId && identifySettings.selectedLayerId !== 'all') {
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
    <div className="tool-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <style>{`
        .side-panel-content {
          overflow-y: hidden !important;
          display: flex !important;
          flex-direction: column !important;
          height: calc(100% - 60px) !important;
        }
      `}</style>
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
              placeholder="Select Layer"
            />
          </div>

          <div className="form-group" style={{ marginBottom: '16px', opacity: identifySettings.selectedLayerId ? 1 : 0.5, pointerEvents: identifySettings.selectedLayerId ? 'auto' : 'none', transition: 'all 0.2s ease' }}>
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

          <div className="identify-instruction" style={{ textAlign: 'center', padding: '16px', color: '#64748b', fontSize: '13px', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1', transition: 'all 0.2s ease' }}>
            {!identifySettings.selectedLayerId ? (
              <div style={{ fontWeight: '600', color: '#df261c' }}>
                Please select a layer to activate the Identify tool.
              </div>
            ) : (
              <>
                <div style={{ marginBottom: '4px', fontWeight: '600', color: '#1e3c72' }}>
                  {identifySettings.mode === 'point' ? 'Map Click Active' : 'Drawing Active'}
                </div>
                {identifySettings.mode === 'point' 
                  ? t('identifyHint') 
                  : "Draw an area on the map to query features intersecting it."}
              </>
            )}
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center',
              cursor: 'pointer', 
              color: '#1e3c72', 
              fontWeight: 'bold', 
              fontSize: '14px',
              marginBottom: '16px',
              paddingBottom: '8px',
              borderBottom: '1px solid #f1f5f9',
              flexShrink: 0
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

          <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', paddingBottom: '24px' }}>
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
                        padding: '12px', maxHeight: '240px', overflowY: 'auto'
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
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button 
                                  className="action-icon-btn" 
                                  title="Zoom To"
                                  onClick={() => {
                                    if (isValidBahrainGeometry(f.geometry, mapView)) {
                                      mapView.goTo({ target: f.geometry, zoom: 15 });
                                    }
                                  }}
                                  style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', color: '#1e3c72', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '600' }}
                                >
                                  <Maximize2 size={12} /> Zoom
                                </button>
                              </div>
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
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            borderTop: '1px solid #f1f5f9',
            paddingTop: '12px',
            marginTop: 'auto',
            flexShrink: 0
          }}>
            <button 
              style={{ 
                fontSize: '13px',
                padding: '8px 18px',
                fontWeight: '600', 
                color: '#64748b',
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
  currentBasemap,
  layersConfig,
  dynamicMapServerData,
  t,
  lang,
  treeData
}) => {
  const isRTL = lang === 'AR';
  const basemapOptions = basemaps.map(bm => ({ id: bm.id, title: bm.title }));
  const isOverlaySelected = !!blendSettings.overlayLayerId;

  const handleReset = () => {
    setBlendSettings(prev => ({
      ...prev,
      baseLayerId: basemaps[0]?.id || null,
      overlayLayerId: null,
      opacity: 0.5,
      blendMode: 'multiply'
    }));
    setCurrentBasemap(basemaps[0]?.id || null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', direction: isRTL ? 'rtl' : 'ltr' }}>
      <div className="panel-content-scroll" style={{ padding: 0, flex: 1 }}>
        <div className="form-group" style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>
            {t('Base Layer (Background)')}
          </label>
          <CustomSelect 
            options={basemapOptions}
            value={blendSettings.baseLayerId}
            onChange={(val) => {
              setBlendSettings(prev => ({ ...prev, baseLayerId: val }));
              setCurrentBasemap(val); 
            }}
            placeholder={t('Select background imagery') + "..."}
          />
        </div>

        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>
            {t('Overlay Layer (Imagery)')}
          </label>
          <TreeSelect 
            treeData={treeData}
            value={blendSettings.overlayLayerId}
            onChange={(val) => setBlendSettings(prev => ({ ...prev, overlayLayerId: val }))}
            placeholder={t('Select overlay imagery') + "..."}
            showAllOption={false}
          />
        </div>

        <div className="form-group" style={{ marginBottom: '12px', opacity: isOverlaySelected ? 1 : 0.5, pointerEvents: isOverlaySelected ? 'auto' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={{ fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>{t('Opacity')}</label>
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
            {t('Blend Mode')}
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
            placeholder={t('Select blend mode') + "..."}
          />
        </div>
      </div>

      <div style={{ 
        padding: '12px 0',
        display: 'flex',
        justifyContent: 'flex-end',
        flexShrink: 0
      }}>
        <button 
          className="secondary-btn"
          onClick={handleReset}
        >
          {t('measureReset') || 'Reset'}
        </button>
      </div>
    </div>
  );
};

export const SpatialAnalysisPanel = ({ 
  view,
  layersConfig, 
  dynamicMapServerData,
  spatialSettings, 
  setSpatialSettings,
  treeData,
  is3D,
  setIs3D,
  layerVisibility,
  setLayerVisibility
}) => {
  const { t, lang } = useLanguage();
  const isRTL = lang === 'AR';
  
  const [activeTab, setActiveTab] = React.useState('analysis');
  const [exportMenuState, setExportMenuState] = React.useState(null);
  const [expandedResults, setExpandedResults] = React.useState([]);

  const getGpManifest = (subTool) => {
    if (subTool === 'Buffer Analysis') return DEFAULT_MANIFESTS.find(m => m.toolId === 'gp_buffer');
    if (subTool === 'Clip Features') return DEFAULT_MANIFESTS.find(m => m.toolId === 'gp_clip');
    if (subTool === 'Summarize Within') return DEFAULT_MANIFESTS.find(m => m.toolId === 'gp_summarize_within');
    if (subTool === 'Viewshed Analysis') return DEFAULT_MANIFESTS.find(m => m.toolId === 'gp_viewshed');
    return null;
  };

  const handleGpChange = (name, val) => {
    setSpatialSettings(prev => ({
      ...prev,
      gpValues: {
        ...(prev.gpValues || {}),
        [name]: val
      }
    }));
  };

  const handleTargetLayerChange = (val) => {
    const manifest = getGpManifest(spatialSettings.subTool);
    const nextGpValues = { ...(spatialSettings.gpValues || {}) };
    if (manifest) {
      const layerParam = manifest.parameters.find(p => p.widgetType === 'LayerPicker');
      if (layerParam) {
        nextGpValues[layerParam.name] = val;
      }
    }
    setSpatialSettings(prev => ({
      ...prev,
      layerId: val,
      gpValues: nextGpValues
    }));
  };

  const history = spatialSettings.history || [];
  
  const [newResultId, setNewResultId] = React.useState(null);
  const prevHistoryLenRef = React.useRef(history.length);

  React.useEffect(() => {
    if (history.length > prevHistoryLenRef.current) {
      const latest = history[history.length - 1];
      if (latest) {
        setNewResultId(latest.id);
        setExpandedResults(prev => [...prev, latest.id]);
        setActiveTab('results');
        const timer = setTimeout(() => {
          setNewResultId(null);
        }, 4000);
        return () => clearTimeout(timer);
      }
    }
    prevHistoryLenRef.current = history.length;
  }, [history.length]);

  const handleExport = async (format, runId) => {
    setExportMenuState(null);
    if (!view || !view.map) return;
    
    const layer = view.map.findLayerById('spatial-analysis-layer');
    if (!layer || !layer.graphics) return;

    const targetGraphics = layer.graphics.toArray().filter(g => g.attributes?.runId === runId);
    if (targetGraphics.length === 0) {
      alert("No features to export.");
      return;
    }

    const titleInfo = targetGraphics[0]?.attributes?.title || 'Analysis_Result';
    const cleanTitle = titleInfo.replace(/[^a-zA-Z0-9_-]/g, '_');
    
    const geojson = graphicsToGeoJSON(targetGraphics, view.spatialReference);

    try {
      if (format === 'GeoJSON') {
        const blob = new Blob([JSON.stringify(geojson)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${cleanTitle}.geojson`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (format === 'Shapefile ZIP') {
        shpwrite.download(geojson, { folder: cleanTitle, types: { point: 'points', polygon: 'polygons', line: 'lines' }});
      } else if (format === 'CSV' || format === 'Excel') {
        const data = targetGraphics.map(g => g.attributes || {});
        if (data.length === 0) return;
        
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Results");
        
        if (format === 'CSV') {
          const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
          const blob = new Blob([csvOutput], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${cleanTitle}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        } else {
          XLSX.writeFile(workbook, `${cleanTitle}.xlsx`);
        }
      } else if (format === 'Image') {
        await view.goTo(targetGraphics);
        // Small delay to allow rendering to settle before taking screenshot
        setTimeout(async () => {
          const screenshot = await view.takeScreenshot({ format: 'png', quality: 100 });
          const a = document.createElement('a');
          a.href = screenshot.dataUrl;
          a.download = `${cleanTitle}.png`;
          a.click();
        }, 800);
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export data: ' + err.message);
    }
  };

  const handleToggle = (runId) => {
    setSpatialSettings(prev => ({
      ...prev,
      history: (prev.history || []).map(r => r.id === runId ? { ...r, visible: !r.visible } : r)
    }));
    if (view && view.map) {
      const targetResults = (spatialSettings.history || []).find(r => r.id === runId);
      const nextVisible = targetResults ? !targetResults.visible : true;

      const layer = view.map.findLayerById('spatial-analysis-layer');
      if (layer && layer.graphics) {
        layer.graphics.forEach(g => {
          if (g.attributes?.runId === runId) {
            g.visible = nextVisible;
          }
        });
      }

      const hmLayer = view.map.findLayerById(`heatmap-${runId}`);
      if (hmLayer) hmLayer.visible = nextVisible;

      toggleGPResultLayer(view, runId, nextVisible);
    }
    if (setLayerVisibility) {
      setLayerVisibility(prev => ({
        ...prev,
        [runId]: prev[runId] !== undefined ? !prev[runId] : false
      }));
    }
  };

  const handleDelete = (runId) => {
    setSpatialSettings(prev => ({
      ...prev,
      history: (prev.history || []).filter(r => r.id !== runId)
    }));
    if (view && view.map) {
      const layer = view.map.findLayerById('spatial-analysis-layer');
      if (layer && layer.graphics) {
        const graphicsToRemove = layer.graphics.toArray().filter(g => g.attributes?.runId === runId);
        layer.removeMany(graphicsToRemove);
      }
      const hmLayer = view.map.findLayerById(`heatmap-${runId}`);
      if (hmLayer) view.map.remove(hmLayer);

      removeGPResultLayer(view, runId);
    }
    if (setLayerVisibility) {
      setLayerVisibility(prev => {
        const next = { ...prev };
        delete next[runId];
        return next;
      });
    }
  };

  const handleZoom = (runId) => {
    if (view && view.map) {
      const layer = view.map.findLayerById('spatial-analysis-layer');
      if (layer && layer.graphics) {
        const graphics = layer.graphics.toArray().filter(g => g.attributes?.runId === runId);
        if (graphics.length > 0) {
           view.goTo(graphics);
           return;
        }
      }

      const hmLayer = view.map.findLayerById(`heatmap-${runId}`);
      if (hmLayer && hmLayer.fullExtent) {
        view.goTo(hmLayer.fullExtent);
        return;
      }

      const prefix = `gp-result-${runId}`;
      const gpLayers = view.map.layers.filter(l => l.id && l.id.startsWith(prefix)).toArray();
      if (gpLayers.length > 0) {
        let fullExtent = null;
        gpLayers.forEach(l => {
          if (l.fullExtent) {
            if (!fullExtent) {
              fullExtent = l.fullExtent.clone();
            } else {
              fullExtent = fullExtent.union(l.fullExtent);
            }
          }
        });
        if (fullExtent) {
          view.goTo(fullExtent.expand(1.5));
        }
      }
    }
  };



  React.useEffect(() => {
    if (spatialSettings.layerId && spatialSettings.layerId !== 'all') {
      const findNode = (nodes, id) => {
        for (const n of nodes) {
          if (n.id === id) return true;
          if (n.children && n.children.length > 0) {
            if (findNode(n.children, id)) return true;
          }
        }
        return false;
      };
      
      if (!findNode(treeData, spatialSettings.layerId)) {
        setSpatialSettings(prev => ({ ...prev, layerId: '' }));
      }
    }
  }, [treeData, spatialSettings.layerId, setSpatialSettings]);

  return (
    <div className="add-data-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', direction: isRTL ? 'rtl' : 'ltr' }}>
      <style>{`
        @keyframes result-fade-highlight {
          0% {
            background-color: rgba(30, 60, 114, 0.15);
            box-shadow: 0 0 12px rgba(30, 60, 114, 0.3);
            border-color: #1e3c72;
          }
          100% {
            background-color: white;
            box-shadow: none;
            border-color: #e2e8f0;
          }
        }
        .result-newly-generated {
          animation: result-fade-highlight 4s forwards;
        }
      `}</style>
      {/* Tabs */}
      <div className="tool-tabs" style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
        <button className={`tool-tab ${activeTab === 'analysis' ? 'active' : ''}`} onClick={() => setActiveTab('analysis')}>
          {t('Analysis')}
        </button>
        <button className={`tool-tab ${activeTab === 'results' ? 'active' : ''}`} onClick={() => setActiveTab('results')}>
          {t('gpTabResults')} {history.length > 0 && <span className="tab-badge">{history.length}</span>}
        </button>
      </div>

      <div className="panel-content-scroll" style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {activeTab === 'analysis' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '0 8px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>{t('Select Analysis Tool')}</label>
              <CustomSelect 
                options={[
                  { label: t('2D Analysis') || '2D Analysis', isHeader: true },
                  { label: t('Buffer Analysis'), value: "Buffer Analysis" },
                  { label: t('Clip Features') || 'Clip Features', value: "Clip Features" },
                  { label: t('Summarize Within') || 'Summarize Within', value: "Summarize Within" },
                  { label: t('Select by Location'), value: "Select by Location" },
                  { label: t('Overlay (Intersect)'), value: "Overlay (Intersect)" },
                  { label: t('Proximity (Nearest)'), value: "Proximity (Nearest)" },
                  { label: t('Heatmap Density'), value: "Heatmap Density" },
                  { label: t('3D Analysis') || '3D Analysis', isHeader: true },
                  { label: t('Viewshed Analysis') || 'Viewshed Analysis', value: "Viewshed Analysis" }
                ]}
                value={spatialSettings.subTool}
                placeholder={t('Choose Analysis...') || 'Choose Analysis...'}
                onChange={(val) => {
                  if (val === 'Viewshed Analysis') {
                    if (!is3D) {
                      setIs3D(true);
                    }
                  }
                  
                  // Initialize/fill target layer if selected
                  const manifest = getGpManifest(val);
                  const nextGpValues = { ...(spatialSettings.gpValues || {}) };
                  if (manifest) {
                    const layerParam = manifest.parameters.find(p => p.widgetType === 'LayerPicker');
                    if (layerParam && spatialSettings.layerId) {
                      nextGpValues[layerParam.name] = spatialSettings.layerId;
                    }
                  }

                  setSpatialSettings(prev => ({
                    ...prev,
                    subTool: val,
                    gpValues: nextGpValues,
                    gpStatus: null
                  }));
                }}
              />
            </div>

            {spatialSettings.subTool && (
              getGpManifest(spatialSettings.subTool) ? (
                <GPFormRenderer 
                  params={getGpManifest(spatialSettings.subTool).parameters} 
                  values={spatialSettings.gpValues || {}} 
                  onChange={handleGpChange} 
                  treeData={treeData}
                  view={view} 
                />
              ) : (
                <>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>{t('Target Layer')}</label>
                    <TreeSelect 
                      treeData={treeData}
                      value={spatialSettings.layerId}
                      onChange={handleTargetLayerChange}
                      placeholder={`${t('gpSelectPlaceholder')} ${t('Target Layer')}...`}
                      showAllOption={false}
                    />
                  </div>

                  {['Select by Location', 'Overlay (Intersect)'].includes(spatialSettings.subTool) && (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>{t('Intersecting Layer')}</label>
                      <TreeSelect 
                        treeData={treeData}
                        value={spatialSettings.secondaryLayerId}
                        onChange={(val) => setSpatialSettings({...spatialSettings, secondaryLayerId: val})}
                        placeholder={`${t('gpSelectPlaceholder')} ${t('Intersecting Layer')}...`}
                        showAllOption={false}
                      />
                    </div>
                  )}

                  {spatialSettings.subTool === 'Proximity (Nearest)' && (
                    <div className="instruction-box">
                      <span className="box-title">{t('Instructions:')}</span>
                      <p>{t('Click any point on the map to find the nearest feature in the selected layer.')}</p>
                    </div>
                  )}
                </>
              )
            )}

            {spatialSettings.gpStatus && (
              <div className="gp-running-card" style={{
                marginTop: '16px',
                background: 'rgba(30, 60, 114, 0.05)',
                border: '1px solid rgba(30, 60, 114, 0.1)',
                borderRadius: '8px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#1e3c72' }}>
                  {t(spatialSettings.subTool)}
                </div>
                <div style={{ fontSize: '12px', color: '#475569' }}>
                  Status: <span style={{ fontWeight: '600', color: '#1e3c72' }}>{t(spatialSettings.gpStatus.message)}</span>
                </div>
                {spatialSettings.gpStatus.progress !== null && (
                  <>
                    <div style={{ fontSize: '12px', color: '#475569' }}>
                      Progress: <span style={{ fontWeight: '600', color: '#1e3c72' }}>{spatialSettings.gpStatus.progress}%</span>
                    </div>
                    <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden', marginTop: '4px' }}>
                      <div style={{
                        width: `${spatialSettings.gpStatus.progress}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #df261c, #002D5D)',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  </>
                )}
              </div>
            )}

            {spatialSettings.status && !spatialSettings.status.includes('Running') && !(spatialSettings.gpStatus && ['submitting', 'executing', 'generating_results'].includes(spatialSettings.gpStatus.status)) && (
              <div className={`status-box ${spatialSettings.status.includes('Click') ? 'waiting' : 'success'}`}>
                {spatialSettings.status.includes('Click') ? '📍 ' : '✔ '} {spatialSettings.status}
              </div>
            )}

            {spatialSettings.distanceResult && (
              <div className="result-highlight-card">
                <span className="result-label">{t('Nearest Distance')}</span>
                <span className="result-value">{spatialSettings.distanceResult}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="results-list" style={{ padding: '0px', gap: '4px' }}>
            {history.length === 0 ? (
              <div className="empty-state">
                <div className="empty-card">
                  <div className="empty-icon-wrapper"><Database size={32} /></div>
                  <h3 className="empty-title">{t('No Analysis Results')}</h3>
                  <p className="empty-desc">{t('Run an analysis tool to see outputs here.')}</p>
                </div>
              </div>
            ) : (
              history.map(item => {
                const isVisible = layerVisibility && layerVisibility[item.id] !== undefined ? layerVisibility[item.id] : (item.visible ?? true);
                const getRgba = (hex, alpha) => {
                  if (!hex) return `rgba(38, 143, 255, ${alpha})`;
                  const cleanHex = hex.replace('#', '');
                  const r = parseInt(cleanHex.substring(0, 2), 16);
                  const g = parseInt(cleanHex.substring(2, 4), 16);
                  const b = parseInt(cleanHex.substring(4, 6), 16);
                  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                };
                const isNew = item.id === newResultId;
                const isExpanded = expandedResults.includes(item.id);

                return (
                  <div 
                    key={item.id} 
                    className={`result-tree-node ${isNew ? 'result-newly-generated' : ''}`}
                    style={{ 
                      border: '1px solid #e2e8f0', 
                      borderRadius: '8px', 
                      marginBottom: '0px', 
                      background: isExpanded ? '#f8fafc' : 'white', 
                      overflow: 'hidden',
                      transition: isNew ? 'none' : 'background-color 0.2s ease, border-color 0.2s ease',
                      animation: isNew ? 'result-fade-highlight 4s forwards' : 'none'
                    }}
                  >
                    {/* Collapsed State / Accordion Header */}
                    <div 
                      style={{ 
                        width: '100%', 
                        padding: '12px 16px', 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        background: 'transparent', 
                        border: 'none', 
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                        textAlign: isRTL ? 'right' : 'left'
                      }}
                      onClick={() => setExpandedResults(prev => 
                        isExpanded ? prev.filter(id => id !== item.id) : [...prev, item.id]
                      )}
                    >
                      {/* Left Side: Expand, Toggle, Color, Stacked Name & Features */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexDirection: isRTL ? 'row-reverse' : 'row', flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#64748b', display: 'flex', alignItems: 'center' }}>
                          {isExpanded ? <ChevronDown size={16} /> : (isRTL ? <ChevronLeft size={16} /> : <ChevronRight size={16} />)}
                        </div>
                        <input
                          type="checkbox"
                          className="custom-checkbox"
                          checked={isVisible}
                          onChange={(e) => { e.stopPropagation(); handleToggle(item.id); }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="child-symbol-wrapper" style={{ margin: '0 2px' }}>
                          <div 
                            className="legend-symbol polygon-symbol" 
                            style={{
                              width: '14px',
                              height: '10px',
                              backgroundColor: getRgba(item.color, 0.4),
                              border: `1.5px dashed ${getRgba(item.color, 1)}`,
                              borderRadius: '2px',
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, textAlign: isRTL ? 'right' : 'left' }}>
                          <span style={{ fontWeight: '700', color: '#1a2f4d', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.title}>
                            {item.title}
                          </span>
                          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>
                            {item.outputFeatureCount ?? item.count} {t('Features') || 'Features'}
                          </span>
                        </div>
                      </div>

                      {/* Right Side: Icon Actions (Zoom, Download, Delete) */}
                      <div 
                        style={{ display: 'flex', alignItems: 'center', gap: '3px', flexDirection: isRTL ? 'row-reverse' : 'row' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button 
                          className="action-btn" 
                          onClick={(e) => { e.stopPropagation(); handleZoom(item.id); }} 
                          title={t('Zoom To') || "Zoom To"}
                          style={{ margin: 0, padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Maximize2 size={14} />
                        </button>
                        
                        <button 
                          className="action-btn" 
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setExportMenuState(exportMenuState?.id === item.id ? null : {
                              id: item.id,
                              x: rect.left,
                              y: rect.bottom
                            });
                          }} 
                          title={t('Download') || "Download"}
                          style={{ margin: 0, padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Download size={14} />
                        </button>

                        <button 
                          className="action-btn delete-btn" 
                          onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} 
                          title={t('Delete') || "Delete"}
                          style={{ margin: 0, padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Expanded State */}
                    {isExpanded && (
                      <div style={{ 
                        padding: '12px 16px', 
                        borderTop: '1px solid #edf2f7', 
                        background: 'white',
                        boxSizing: 'border-box'
                      }}>
                        <div className="attributes-grid" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', fontSize: '11px', borderBottom: '1px solid #f7fafc', padding: '4px 0', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <span style={{ color: '#64748b', width: '45%', flexShrink: 0, fontWeight: '500', textAlign: isRTL ? 'right' : 'left' }}>{t('Input Features') || 'Input Features'}</span>
                            <span style={{ color: '#1e293b', fontWeight: '600', textAlign: isRTL ? 'left' : 'right', flexGrow: 1 }}>{item.inputFeatureCount ?? 'N/A'}</span>
                          </div>
                          <div style={{ display: 'flex', fontSize: '11px', borderBottom: '1px solid #f7fafc', padding: '4px 0', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <span style={{ color: '#64748b', width: '45%', flexShrink: 0, fontWeight: '500', textAlign: isRTL ? 'right' : 'left' }}>{t('Output Features') || 'Output Features'}</span>
                            <span style={{ color: '#1e293b', fontWeight: '600', textAlign: isRTL ? 'left' : 'right', flexGrow: 1 }}>{item.outputFeatureCount ?? item.count}</span>
                          </div>
                          <div style={{ display: 'flex', fontSize: '11px', borderBottom: '1px solid #f7fafc', padding: '4px 0', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <span style={{ color: '#64748b', width: '45%', flexShrink: 0, fontWeight: '500', textAlign: isRTL ? 'right' : 'left' }}>{t('Geometry Type') || 'Geometry Type'}</span>
                            <span style={{ color: '#1e293b', fontWeight: '600', textAlign: isRTL ? 'left' : 'right', flexGrow: 1 }}>{item.geometryType ?? 'Polygon'}</span>
                          </div>
                          <div style={{ display: 'flex', fontSize: '11px', borderBottom: '1px solid #f7fafc', padding: '4px 0', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <span style={{ color: '#64748b', width: '45%', flexShrink: 0, fontWeight: '500', textAlign: isRTL ? 'right' : 'left' }}>{t('Analysis Type') || 'Analysis Type'}</span>
                            <span style={{ color: '#1e293b', fontWeight: '600', textAlign: isRTL ? 'left' : 'right', flexGrow: 1 }}>{t(item.analysisType) || item.analysisType || 'N/A'}</span>
                          </div>
                          <div style={{ display: 'flex', fontSize: '11px', borderBottom: '1px solid #f7fafc', padding: '4px 0', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <span style={{ color: '#64748b', width: '45%', flexShrink: 0, fontWeight: '500', textAlign: isRTL ? 'right' : 'left' }}>{t('Execution Time') || 'Execution Time'}</span>
                            <span style={{ color: '#1e293b', fontWeight: '600', textAlign: isRTL ? 'left' : 'right', flexGrow: 1 }}>{item.executionTime !== undefined ? `${item.executionTime} ms` : 'N/A'}</span>
                          </div>
                          <div style={{ display: 'flex', fontSize: '11px', borderBottom: '1px solid #f7fafc', padding: '4px 0', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <span style={{ color: '#64748b', width: '45%', flexShrink: 0, fontWeight: '500', textAlign: isRTL ? 'right' : 'left' }}>{t('Created On') || 'Created On'}</span>
                            <span style={{ color: '#1e293b', fontWeight: '600', textAlign: isRTL ? 'left' : 'right', flexGrow: 1 }}>{item.date || new Date(item.id).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {exportMenuState?.id === item.id && createPortal(
                      <div 
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99998 }}
                        onClick={(e) => { e.stopPropagation(); setExportMenuState(null); }}
                      >
                        <div style={{ 
                          position: 'absolute', 
                          top: exportMenuState.y + 4, 
                          left: exportMenuState.x - 110,
                          background: 'white', 
                          border: '1px solid #e2e8f0', 
                          borderRadius: '6px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', 
                          zIndex: 99999, 
                          minWidth: '140px',
                          display: 'flex', 
                          flexDirection: 'column'
                        }}
                        onClick={(e) => e.stopPropagation()}
                        >
                          {['GeoJSON', 'Shapefile ZIP', 'CSV', 'Excel', 'Image'].map(fmt => (
                            <button 
                              key={fmt}
                              style={{ padding: '8px 12px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: 'transparent', border: 'none', textAlign: isRTL ? 'right' : 'left', width: '100%', color: '#1e293b' }}
                              onClick={(e) => { e.stopPropagation(); handleExport(fmt, item.id); }}
                            >
                              {fmt}
                            </button>
                          ))}
                        </div>
                      </div>,
                      document.body
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {activeTab === 'analysis' && (
        <div className="tool-fixed-footer" style={{ borderTop: '1px solid rgba(0, 0, 0, 0.05)', flexShrink: 0, marginTop: 0 }}>
          <button 
            className="secondary-btn"
            disabled={spatialSettings.gpStatus && ['submitting', 'executing', 'generating_results'].includes(spatialSettings.gpStatus.status)}
            onClick={() => {
              setSpatialSettings({
                ...spatialSettings,
                status: '',
                lastRun: null,
                distanceResult: null,
                isWaitingForClick: false,
                history: [],
                gpValues: {},
                gpStatus: null
              });
              if (view && view.map) {
                const layer = view.map.findLayerById('spatial-analysis-layer');
                if (layer && layer.removeAll) layer.removeAll();
                
                const layersToRemove = view.map.layers.filter(l => l.id && (l.id.startsWith('heatmap-') || l.id.startsWith('gp-result-'))).toArray();
                if (layersToRemove.length > 0) {
                  view.map.removeMany(layersToRemove);
                }

                if (view.analyses) {
                  view.analyses.removeAll();
                }
              }
            }}
          >
            {t('Clear All')}
          </button>
          <button 
            className="primary-btn" 
            disabled={
              !spatialSettings.subTool || 
              spatialSettings.isWaitingForClick || 
              (spatialSettings.gpStatus && ['submitting', 'executing', 'generating_results'].includes(spatialSettings.gpStatus.status))
            }
            onClick={() => {
              if (spatialSettings.gpStatus && ['submitting', 'executing', 'generating_results'].includes(spatialSettings.gpStatus.status)) {
                return;
              }
              const isProximity = spatialSettings.subTool === 'Proximity (Nearest)';
              
              setSpatialSettings({
                ...spatialSettings, 
                lastRun: Date.now(), 
                isWaitingForClick: isProximity,
                status: isProximity 
                  ? t('Ready: Click any point on the map') || 'Ready: Click any point on the map' 
                  : `${t('Running')} ${t(spatialSettings.subTool)}...`,
                distanceResult: null,
                gpStatus: isProximity 
                  ? null 
                  : { status: 'submitting', message: 'Submitting', progress: 10 }
              });
            }}
          >
            {spatialSettings.subTool === 'Proximity (Nearest)' ? t('Start Tracking') || 'Start Tracking' : t('Run Analysis')}
          </button>
        </div>
      )}
    </div>
  );
};

// ── Swipe/Split Panel Component ──────────────────────────────────────────────
export const SwipePanel = ({ 
  t, 
  lang,
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
  setShowSplitBasemap,
  treeData
}) => {
  const isRTL = lang === 'AR';

  return (
    <div className="tool-content" style={{ direction: isRTL ? 'rtl' : 'ltr', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-content-scroll" style={{ padding: '0 8px 16px 8px', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'rgba(30, 60, 114, 0.05)', borderRadius: '8px', marginBottom: '20px', border: '1px solid rgba(30, 60, 114, 0.1)' }}>
          <span style={{ fontWeight: '700', color: '#1a2f4d', fontSize: '14px' }}>
            {isSplitModePersistent ? t('Swipe Active') : t('Enable Swipe')}
          </span>
          <button 
            onClick={() => setIsSplitModePersistent(!isSplitModePersistent)}
            className="no-stroke-btn"
            style={{ background: isSplitModePersistent ? '#cbd5e1' : 'linear-gradient(135deg, #df261c, #002D5D)', color: isSplitModePersistent ? '#1a2f4d' : 'white', padding: '8px 18px', fontSize: '13px', fontWeight: '600', borderRadius: '10px', border: 'none', transition: 'all 0.3s ease', cursor: 'pointer' }}
          >
            {isSplitModePersistent ? t('Disable') : t('Enable')}
          </button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>{t('Swipe Direction')}</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { id: 'vertical',   label: `— ${t('Vertical Swipe')}` },
              { id: 'horizontal', label: `| ${t('Horizontal Swipe')}` }
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
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d' }}>{t('Left Side Layer')}</label>
          <div style={{ display: 'flex', gap: '8px', position: 'relative', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <TreeSelect 
                treeData={treeData}
                value={splitLayers.left} 
                onChange={(val) => setSplitLayers(prev => ({ ...prev, left: val }))}
                placeholder={t('Select left layers') + "..."}
                multi={true}
                showAllOption={false}
              />
            </div>
            <button 
              className={`basemap-toggle-btn ${showSplitBasemap.left ? 'active' : ''}`}
              onClick={() => setShowSplitBasemap(prev => ({ ...prev, left: !prev.left, right: false }))}
              title="Change Basemap"
              style={{ marginTop: '2px' }}
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
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d' }}>{t('Right Side Layer')}</label>
          <div style={{ display: 'flex', gap: '8px', position: 'relative', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <TreeSelect 
                treeData={treeData}
                value={splitLayers.right} 
                onChange={(val) => setSplitLayers(prev => ({ ...prev, right: val }))}
                placeholder={t('Select right layers') + "..."}
                multi={true}
                showAllOption={false}
              />
            </div>
            <button 
              className={`basemap-toggle-btn ${showSplitBasemap.right ? 'active' : ''}`}
              onClick={() => setShowSplitBasemap(prev => ({ ...prev, right: !prev.right, left: false }))}
              title="Change Basemap"
              style={{ marginTop: '2px' }}
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
  setShowSplitBasemap,
  t,
  lang,
  treeData
}) => {
  const isRTL = lang === 'AR';

  return (
    <div className="tool-content" style={{ direction: isRTL ? 'rtl' : 'ltr', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-content-scroll" style={{ padding: '0 8px 16px 8px', flex: 1 }}>
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
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#1a2f4d' }}>{t('Left Side')}</label>
          <div style={{ display: 'flex', gap: '8px', position: 'relative', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <TreeSelect
                treeData={treeData}
                value={splitLayers.left}
                onChange={(val) => setSplitLayers(prev => ({ ...prev, left: val }))}
                placeholder={t('Select left layers') + "..."}
                multi={true}
                showAllOption={false}
              />
            </div>
            <button 
              className={`basemap-toggle-btn ${showSplitBasemap.left ? 'active' : ''}`}
              onClick={() => setShowSplitBasemap(prev => ({ ...prev, left: !prev.left, right: false }))}
              title="Change Basemap"
              style={{ marginTop: '2px' }}
            >
              <Map size={16} />
            </button>
            <button 
              className="view-mode-single-btn"
              onClick={() => setSplitModes(prev => ({ ...prev, left: prev.left === '2D' ? '3D' : '2D' }))}
              style={{ marginTop: '2px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px', minWidth: '40px', fontSize: '12px', fontWeight: '800', color: '#1a2f4d', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
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
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#1a2f4d' }}>{t('Right Side')}</label>
          <div style={{ display: 'flex', gap: '8px', position: 'relative', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <TreeSelect
                treeData={treeData}
                value={splitLayers.right}
                onChange={(val) => setSplitLayers(prev => ({ ...prev, right: val }))}
                placeholder={t('Select right layers') + "..."}
                multi={true}
                showAllOption={false}
              />
            </div>
            <button 
              className={`basemap-toggle-btn ${showSplitBasemap.right ? 'active' : ''}`}
              onClick={() => setShowSplitBasemap(prev => ({ ...prev, right: !prev.right, left: false }))}
              title="Change Basemap"
              style={{ marginTop: '2px' }}
            >
              <Map size={16} />
            </button>
            <button 
              className="view-mode-single-btn"
              onClick={() => setSplitModes(prev => ({ ...prev, right: prev.right === '2D' ? '3D' : '2D' }))}
              style={{ marginTop: '2px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px', minWidth: '40px', fontSize: '12px', fontWeight: '800', color: '#1a2f4d', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
            >
              {splitModes.right === '2D' ? '3D' : '2D'}
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

        <div className="form-group" style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>{t('Extent Synchronization')}</label>
          <CustomSelect
            options={[
              { value: 'both', title: t('Sync Both Views (pan + zoom)') },
              { value: 'zoom', title: t('Sync Zoom Only') },
              { value: 'none', title: t('Independent Views') }
            ]}
            value={syncMode}
            onChange={(val) => setSyncMode(val)}
            placeholder="Select sync mode..."
          />
        </div>
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
  project_data: ProjectDataPanel,
  print: PrintPanel,
  arcade: ArcadePanel,
  time_compare: TemporalFilterPanel,
  advanced_query: AdvancedQueryPanel,
  data_request: DataRequestPanel,
  bookmark: BookmarkPanel,
  layers: LayersPanel,

  // Geoprocessing Framework
  geoprocessing: GPPanel,

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

