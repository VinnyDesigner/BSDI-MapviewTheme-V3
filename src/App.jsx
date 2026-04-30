import React, { useState, useEffect } from 'react'
import ArcGISMap from './components/MapView'
import BottomToolbar from './components/BottomToolbar'
import SidePanel from './components/SidePanel'
import Header from './components/Header'
import MapControls from './components/MapControls'
import MapInfoWidget from './components/MapInfoWidget'
import DualMapView from './components/DualMapView'
import { layersConfig } from './layers'
import { LanguageProvider, useLanguage } from './context/LanguageContext'
import { translations } from './i18n/translations'
import './App.css'

import {
  Layers, Search, Navigation, Ruler, Pencil,
  Box, Database, Globe, Printer, Bookmark, Info,
  Columns2
} from 'lucide-react';

import RightToolbar from './components/RightToolbar'

// ─── Inner app — has access to LanguageContext ────────────────────────────────
function AppInner() {
  const { t, lang } = useLanguage();

  const [activeTool, setActiveTool] = useState(null)
  const [pinnedTools, setPinnedTools] = useState([])
  const [mapView, setMapView] = useState(null)
  const [is3D, setIs3D] = useState(false)
  const [layerVisibility, setLayerVisibility] = useState(
    layersConfig.reduce((acc, layer) => ({ ...acc, [layer.id]: layer.visible }), {})
  )
  
  const [splitLayers, setSplitLayers] = useState({
    left: layersConfig[0]?.id || '',
    right: layersConfig[1]?.id || layersConfig[0]?.id || ''
  })
  const [isSplitModePersistent, setIsSplitModePersistent] = useState(false);
  const [isSplitView, setIsSplitView] = useState(false);
  const [syncMode, setSyncMode] = useState('both'); // 'both' | 'zoom' | 'none'
  const [blendSettings, setBlendSettings] = useState({
    baseLayerId: 'satellite-present',
    overlayLayerId: 'historical-1990',
    opacity: 0.5,
    blendMode: 'multiply'
  });
  const [arcadeSettings, setArcadeSettings] = useState({
    applyTo: 'Styling',
    layerId: 'heritage-sites',
    expression: '',
    template: '',
    status: '',
    lastApplied: null,
    preview: 'Enter expression to see preview',
    debugInfo: null,
    showDebug: false
  });
  const [spatialSettings, setSpatialSettings] = useState({
    subTool: 'Buffer Analysis',
    layerId: 'heritage-sites',
    bufferDistance: 1000,
    bufferUnit: 'meters',
    proximityPoint: null,
    distanceResult: null,
    isWaitingForClick: false,
    status: '',
    lastRun: null
  });
  const [swipeMode, setSwipeMode] = useState('vertical'); // 'vertical' | 'horizontal'
  const [swipeInfo, setSwipeInfo] = useState({ position: 50, viewWidth: 0, viewHeight: 0 });
  const [currentBasemap, setCurrentBasemap] = useState('streets-navigation-vector');

  const basemaps = [
    {
      id: "dark-gray-vector",
      title: "Dark Gray Canvas",
      thumbnail: "/assets/basemaps/dark-gray.jpg"
    },
    {
      id: "satellite",
      title: "Imagery",
      thumbnail: "/assets/basemaps/imagery.jpg"
    },
    {
      id: "hybrid",
      title: "Imagery Hybrid",
      thumbnail: "/assets/basemaps/hybrid.jpg"
    },
    {
      id: "gray-vector",
      title: "Light Gray Canvas",
      thumbnail: "/assets/basemaps/light-gray.jpg"
    },
    {
      id: "streets-navigation-vector",
      title: "Navigation Map",
      thumbnail: "/assets/basemaps/navigation.jpg"
    },
    {
      id: "oceans",
      title: "Oceans",
      thumbnail: "/assets/basemaps/oceans.jpg"
    }
  ];

  // ── Tool icon lookup ────────────────────────────────────────────────────────
  const getToolIcon = (toolId) => {
    const icons = {
      layers: <Layers size={16} />, search: <Search size={16} />,
      navigation: <Navigation size={16} />, measure: <Ruler size={16} />,
      draw: <Pencil size={16} />, cad: <Box size={16} />,
      data_request: <Database size={16} />, external_data: <Globe size={16} />,
      print: <Printer size={16} />, bookmark: <Bookmark size={16} />,
      identify:     <Info size={16} />, 
      split:        <Columns2 size={16} />,
      split_view:   <i className="material-icons" style={{ fontSize: '16px' }}>splitscreen</i>,
      blend: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="8" cy="12" r="7" />
          <circle cx="16" cy="12" r="7" />
        </svg>
      ),
    };
    return icons[toolId] ?? null;
  }

  // ── Panel title — reads from nested panelTitles map ──────────────────────
  const getPanelTitle = (toolId) => {
    if (!toolId) return '';
    return translations[lang].panelTitles[toolId]
      ?? (toolId.charAt(0).toUpperCase() + toolId.slice(1).replace('_', ' '));
  }

  // ── Click-outside to close panel ───────────────────────────────────────────
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        activeTool &&
        activeTool !== 'split_view' && // Keep Split View panel persistent
        !e.target.closest('.side-panel-container') &&
        !e.target.closest('.bottom-toolbar-container') &&
        !e.target.closest('.map-controls-container') &&
        !e.target.closest('.right-toolbar-container')
      ) {
        setActiveTool(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeTool]);

  const handleToolSelect = (toolId) => {
    if (toolId === activeTool) { 
      setActiveTool(null); 
      return; 
    }

    // Mutual Exclusivity: Disable persistent features when switching to a different tool
    if (toolId !== 'split_view') setIsSplitView(false);
    if (toolId !== 'split') setIsSplitModePersistent(false);
    
    // Disable blending if we move to a feature that doesn't support it (split/swipe)
    // But keep it active if we're just opening other panels like search? 
    // User said "Only one active tool at a time" and "Do not stack with split/swipe"
    // So if split or swipe becomes active, we must ensure blend is effectively "off".
    // We'll use the activeTool === 'blend' check to render it in MapView.

    if (pinnedTools.includes(toolId)) setPinnedTools(prev => prev.filter(id => id !== toolId));
    setActiveTool(toolId);
  }

  const handleMinimize = () => {
    if (activeTool && !pinnedTools.includes(activeTool)) {
      setPinnedTools(prev => [...prev, activeTool]);
      setActiveTool(null);
    }
  }

  const handleRestore = (toolId) => {
    setPinnedTools(prev => prev.filter(id => id !== toolId));
    setActiveTool(toolId);
  }

  const toggleLayer = (id) =>
    setLayerVisibility(prev => ({ ...prev, [id]: !prev[id] }))

  // ── Panel content ──────────────────────────────────────────────────────────
  // ✅ All t() calls are for STATIC UI strings only.
  // ❌ Dynamic data (layer.title, API values) is rendered directly — never t(layer.title).
  const getPanelContent = (toolId) => {
    switch (toolId) {
      case 'basemap':
        return (
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
      case 'layers':
        return (
          <div className="tool-content">
            <p className="description">{t('layersPanelDesc')}</p>
            <div className="layer-list">
              {layersConfig.map(layer => (
                <div key={layer.id} className="layer-item">
                  <label className="checkbox-container">
                    <input
                      type="checkbox"
                      checked={layerVisibility[layer.id]}
                      onChange={() => toggleLayer(layer.id)}
                    />
                    <span className="layer-name">{layer.title}</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        );

      case 'blend':
        return (
          <div className="tool-content">
            <p className="description" style={{ marginBottom: '20px', color: '#64748b', fontSize: '13px' }}>
              Create complex visual effects by blending two map layers together.
            </p>
            
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>
                Base Layer
              </label>
              <select 
                className="tool-select" 
                value={blendSettings.baseLayerId}
                onChange={(e) => setBlendSettings(prev => ({ ...prev, baseLayerId: e.target.value }))}
              >
                {layersConfig.map(l => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>
                Overlay Layer
              </label>
              <select 
                className="tool-select" 
                value={blendSettings.overlayLayerId}
                onChange={(e) => setBlendSettings(prev => ({ ...prev, overlayLayerId: e.target.value }))}
              >
                {layersConfig.map(l => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
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
                onChange={(e) => setBlendSettings(prev => ({ ...prev, opacity: parseFloat(e.target.value) }))}
                style={{ 
                  width: '100%', 
                  accentColor: '#DF261C',
                  cursor: 'pointer'
                }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>
                Blend Mode
              </label>
              <select 
                className="tool-select" 
                value={blendSettings.blendMode}
                onChange={(e) => setBlendSettings(prev => ({ ...prev, blendMode: e.target.value }))}
              >
                <option value="normal">Normal</option>
                <option value="multiply">Multiply</option>
                <option value="overlay">Overlay</option>
                <option value="screen">Screen</option>
                <option value="color-burn">Color Burn</option>
                <option value="destination-over">Destination Over</option>
                <option value="lighter">Lighter</option>
              </select>
            </div>
          </div>
        );

      case 'arcade':
        return (
          <div className="tool-content" style={{ paddingBottom: '16px' }}>
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Apply To</label>
              <select 
                className="tool-select"
                value={arcadeSettings.applyTo}
                onChange={(e) => setArcadeSettings({...arcadeSettings, applyTo: e.target.value})}
              >
                <option>Styling</option>
                <option>Labels</option>
                <option>Popup</option>
                <option>Filtering</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Target Layer</label>
              <select 
                className="tool-select"
                value={arcadeSettings.layerId}
                onChange={(e) => setArcadeSettings({...arcadeSettings, layerId: e.target.value})}
              >
                {layersConfig.map(l => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Quick Templates</label>
              <select 
                className="tool-select"
                value={arcadeSettings.template}
                onChange={(e) => {
                  const val = e.target.value;
                  let expr = '';
                  if (val === 'Population Density') expr = 'return $feature.population / $feature.area;';
                  if (val === 'Highlight Coastal') expr = "return When($feature.type == 'Coastal', 'High', 'Low');";
                  if (val === 'Conditional Label') expr = "if ($feature.status == 1) { return 'Active'; } else { return 'Inactive'; }";
                  setArcadeSettings({...arcadeSettings, template: val, expression: expr});
                }}
              >
                <option value="">-- Select Template --</option>
                <option>Population Density</option>
                <option>Highlight Coastal</option>
                <option>Conditional Label</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Field Picker</label>
              <div className="field-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {['$feature.name', '$feature.type', '$feature.area', '$feature.population'].map(field => (
                  <button 
                    key={field}
                    onClick={() => setArcadeSettings({...arcadeSettings, expression: arcadeSettings.expression + ' ' + field})}
                    style={{ 
                      padding: '4px 10px', 
                      background: '#f1f5f9', 
                      border: '1px solid #e2e8f0', 
                      borderRadius: '6px', 
                      fontSize: '11px', 
                      color: '#1e3c72',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    {field}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Expression Editor</label>
              <textarea 
                className="tool-input"
                style={{ height: '100px', padding: '12px', fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' }}
                placeholder="Write Arcade expression here..."
                value={arcadeSettings.expression}
                onChange={(e) => setArcadeSettings({...arcadeSettings, expression: e.target.value})}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <div style={{ 
                padding: '12px', 
                background: arcadeSettings.preview.includes('Error') ? '#fff1f2' : '#f8fafc', 
                borderRadius: '8px', 
                border: '1px solid ' + (arcadeSettings.preview.includes('Error') ? '#fecaca' : '#e2e8f0') 
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Output Preview</span>
                  <button 
                    onClick={() => setArcadeSettings(prev => ({ ...prev, showDebug: !prev.showDebug }))}
                    style={{ fontSize: '10px', background: 'none', border: 'none', color: '#1e3c72', cursor: 'pointer', fontWeight: '600' }}
                  >
                    {arcadeSettings.showDebug ? 'Hide Debug' : 'Show Debug'}
                  </button>
                </div>
                <span style={{ 
                  fontSize: '14px', 
                  fontWeight: '800', 
                  color: arcadeSettings.preview.includes('Error') ? '#be123c' : '#1a2f4d', 
                  display: 'block' 
                }}>
                  {arcadeSettings.expression 
                    ? (arcadeSettings.preview.includes('Error') ? `❌ ${arcadeSettings.preview}` : `Result: ${arcadeSettings.preview}`) 
                    : 'Enter expression to see preview'}
                </span>
              </div>
            </div>

            {arcadeSettings.showDebug && arcadeSettings.debugInfo && (
              <div style={{ marginBottom: '16px', padding: '10px', background: '#1e293b', color: '#cbd5e1', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace', maxHeight: '100px', overflowY: 'auto' }}>
                <div style={{ color: '#94a3b8', marginBottom: '4px', borderBottom: '1px solid #334155', paddingBottom: '2px' }}>Sample Feature Attributes:</div>
                {Object.entries(arcadeSettings.debugInfo).map(([k, v]) => (
                  <div key={k}>{k}: {String(v)}</div>
                ))}
              </div>
            )}

            {arcadeSettings.applyTo === 'Styling' && arcadeSettings.lastApplied && (
              <div style={{ marginBottom: '20px', padding: '12px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#1a2f4d', fontWeight: '700' }}>Color Scale (Legend)</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ height: '12px', flex: 1, background: 'linear-gradient(to right, #f7fcf0, #084081)', borderRadius: '4px' }}></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '10px', color: '#64748b' }}>
                  <span>Low / 0</span>
                  <span>High / 100+</span>
                </div>
              </div>
            )}

            <div className="arcade-guide" style={{ marginBottom: '20px', padding: '12px', background: 'rgba(30, 60, 114, 0.03)', borderRadius: '8px', border: '1px dashed rgba(30, 60, 114, 0.2)' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#1e3c72', fontWeight: '700' }}>Where to see results:</h4>
              <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: '11px', color: '#64748b', lineHeight: '1.6' }}>
                <li><b>Popup:</b> Click on any feature on the map</li>
                <li><b>Styling:</b> Observe color changes based on the legend above</li>
                <li><b>Labels:</b> Check text appearing over features</li>
                <li><b>Filtering:</b> Features will show/hide dynamically</li>
              </ul>
            </div>

            {arcadeSettings.status && (
              <div style={{ 
                marginBottom: '16px', 
                padding: '12px', 
                background: arcadeSettings.status.includes('Error') ? '#fef2f2' : '#f0fdf4',
                color: arcadeSettings.status.includes('Error') ? '#991b1b' : '#166534',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '700',
                textAlign: 'center',
                border: '1px solid' + (arcadeSettings.status.includes('Error') ? '#fee2e2' : '#dcfce7'),
                animation: 'fadeIn 0.3s ease'
              }}>
                ✔ {arcadeSettings.status}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="primary-btn" 
                style={{ 
                  flex: 1, 
                  padding: '10px', 
                  borderRadius: '10px', 
                  background: arcadeSettings.preview.includes('Error') || !arcadeSettings.expression ? '#e2e8f0' : 'linear-gradient(135deg, #df261c, #002d5d)', 
                  color: arcadeSettings.preview.includes('Error') || !arcadeSettings.expression ? '#64748b' : 'white', 
                  fontWeight: '700', 
                  border: 'none', 
                  cursor: arcadeSettings.preview.includes('Error') || !arcadeSettings.expression ? 'not-allowed' : 'pointer',
                  opacity: arcadeSettings.preview.includes('Error') || !arcadeSettings.expression ? 0.8 : 1
                }}
                disabled={!arcadeSettings.expression || arcadeSettings.preview.includes('Error')}
                onClick={() => {
                  const hintMap = {
                    'Popup': 'Click feature to see output',
                    'Styling': 'Check map color changes',
                    'Labels': 'Labels appear on map',
                    'Filtering': 'Features will hide/show'
                  };
                  setArcadeSettings(prev => ({ 
                    ...prev, 
                    lastApplied: Date.now(),
                    status: `${prev.applyTo} applied successfully — ${hintMap[prev.applyTo]}`
                  }));
                }}
              >
                Apply
              </button>
              <button 
                className="secondary-btn"
                style={{ flex: 1, padding: '10px', borderRadius: '10px', background: '#f1f5f9', color: '#1a2f4d', fontWeight: '700', border: '1px solid #e2e8f0', cursor: 'pointer' }}
                onClick={() => setArcadeSettings({
                  ...arcadeSettings,
                  expression: '',
                  template: '',
                  status: '',
                  lastApplied: null
                })}
              >
                Reset
              </button>
            </div>
          </div>
        );

      case 'spatial_analysis':
        return (
          <div className="tool-content" style={{ paddingBottom: '16px' }}>
            <p className="description" style={{ marginBottom: '20px', color: '#64748b', fontSize: '13px' }}>
              Perform advanced spatial operations to derive geographical insights.
            </p>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Select Analysis Tool</label>
              <select 
                className="tool-select"
                value={spatialSettings.subTool}
                onChange={(e) => setSpatialSettings({...spatialSettings, subTool: e.target.value})}
              >
                <option>Buffer Analysis</option>
                <option>Select by Location</option>
                <option>Overlay (Intersect)</option>
                <option>Proximity (Nearest)</option>
                <option>Heatmap Density</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Target Layer</label>
              <select 
                className="tool-select"
                value={spatialSettings.layerId}
                onChange={(e) => setSpatialSettings({...spatialSettings, layerId: e.target.value})}
              >
                {layersConfig.map(l => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </div>

            {spatialSettings.subTool === 'Buffer Analysis' && (
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 2 }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Distance</label>
                    <input 
                      type="number" 
                      className="tool-input" 
                      value={spatialSettings.bufferDistance}
                      onChange={(e) => setSpatialSettings({...spatialSettings, bufferDistance: Number(e.target.value)})}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Unit</label>
                    <select 
                      className="tool-select"
                      value={spatialSettings.bufferUnit}
                      onChange={(e) => setSpatialSettings({...spatialSettings, bufferUnit: e.target.value})}
                    >
                      <option value="meters">m</option>
                      <option value="kilometers">km</option>
                      <option value="miles">mi</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {spatialSettings.subTool === 'Proximity (Nearest)' && (
              <div style={{ marginBottom: '16px', padding: '12px', background: 'rgba(30, 60, 114, 0.05)', borderRadius: '8px', border: '1px dashed #1e3c72' }}>
                <span style={{ fontSize: '12px', color: '#1e3c72', fontWeight: '600' }}>Instructions:</span>
                <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#64748b' }}>Click any point on the map to find the nearest feature in the selected layer.</p>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: '20px' }}>
              <div className="arcade-guide" style={{ padding: '12px', background: 'rgba(30, 60, 114, 0.03)', borderRadius: '8px', border: '1px dashed rgba(30, 60, 114, 0.2)' }}>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#1e3c72', fontWeight: '700' }}>Tool Info:</h4>
                <p style={{ margin: 0, fontSize: '11px', color: '#64748b', lineHeight: '1.4' }}>
                  {spatialSettings.subTool === 'Buffer Analysis' && "Creates a polygon around map features at a specified distance."}
                  {spatialSettings.subTool === 'Select by Location' && "Filters features based on their spatial relationship with another layer."}
                  {spatialSettings.subTool === 'Overlay (Intersect)' && "Identifies areas where two layers geographically overlap."}
                  {spatialSettings.subTool === 'Proximity (Nearest)' && "Calculates the straight-line distance to the closest item."}
                  {spatialSettings.subTool === 'Heatmap Density' && "Visualizes the geographic concentration of features."}
                </p>
              </div>
            </div>

            {spatialSettings.status && (
              <div style={{ 
                marginBottom: '16px', 
                padding: '12px', 
                background: spatialSettings.status.includes('Click') ? 'rgba(30, 60, 114, 0.05)' : '#f0fdf4', 
                color: spatialSettings.status.includes('Click') ? '#1e3c72' : '#166534', 
                borderRadius: '8px', 
                fontSize: '12px', 
                fontWeight: '700', 
                textAlign: 'center', 
                border: '1px solid ' + (spatialSettings.status.includes('Click') ? '#1e3c72' : '#dcfce7') 
              }}>
                {spatialSettings.status.includes('Click') ? '📍 ' : '✔ '} {spatialSettings.status}
              </div>
            )}

            {spatialSettings.distanceResult && (
              <div style={{ marginBottom: '16px', padding: '15px', background: '#1e3c72', color: 'white', borderRadius: '12px', textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', opacity: 0.8, display: 'block', marginBottom: '4px' }}>Nearest Distance</span>
                <span style={{ fontSize: '24px', fontWeight: '800' }}>{spatialSettings.distanceResult}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="primary-btn" 
                style={{ flex: 1, padding: '10px', borderRadius: '10px', background: 'linear-gradient(135deg, #df261c, #002d5d)', color: 'white', fontWeight: '700', border: 'none', cursor: 'pointer' }}
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
              <button 
                className="secondary-btn"
                style={{ flex: 1, padding: '10px', borderRadius: '10px', background: '#f1f5f9', color: '#1a2f4d', fontWeight: '700', border: '1px solid #e2e8f0', cursor: 'pointer' }}
                onClick={() => setSpatialSettings({...spatialSettings, status: '', lastRun: null, distanceResult: null, isWaitingForClick: false})}
              >
                Clear
              </button>
            </div>
          </div>
        );

      case 'identify':
        return (
          <div className="tool-content">
            <p>{t('identifyHint')}</p>
            <div className="info-box">{t('identifyActive')}</div>
          </div>
        );
        
      case 'split':
        return (
          <div className="tool-content">
            <p className="description">{t('splitPanelDesc')}</p>
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
                  { id: 'horizontal', label: '| Vertical Swipe' },
                  { id: 'vertical',   label: '— Horizontal Swipe' }
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setSwipeMode(id)}
                    style={{ flex: 1, padding: '7px 0', borderRadius: '6px', border: '1.5px solid', borderColor: swipeMode === id ? '#1e3c72' : '#e2e8f0', background: swipeMode === id ? 'linear-gradient(135deg, #1e3c72, #2a5298)' : 'white', color: swipeMode === id ? 'white' : '#1a2f4d', fontWeight: '700', fontSize: '11px', cursor: 'pointer' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d' }}>{t('splitLeftLayer')}</label>
              <select className="tool-select" value={splitLayers.left} onChange={(e) => setSplitLayers(prev => ({ ...prev, left: e.target.value }))} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <optgroup label={t('splitLayerLabel')}>
                  {layersConfig.filter(l => !l.time).map(layer => (<option key={layer.id} value={layer.id}>{layer.title}</option>))}
                </optgroup>
                <optgroup label={t('splitTimeLabel')}>
                  {layersConfig.filter(l => l.time).map(layer => (<option key={layer.id} value={layer.id}>{layer.title}</option>))}
                </optgroup>
              </select>
            </div>
            <div className="form-group">
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d' }}>{t('splitRightLayer')}</label>
              <select className="tool-select" value={splitLayers.right} onChange={(e) => setSplitLayers(prev => ({ ...prev, right: e.target.value }))} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <optgroup label={t('splitLayerLabel')}>
                  {layersConfig.filter(l => !l.time).map(layer => (<option key={layer.id} value={layer.id}>{layer.title}</option>))}
                </optgroup>
                <optgroup label={t('splitTimeLabel')}>
                  {layersConfig.filter(l => l.time).map(layer => (<option key={layer.id} value={layer.id}>{layer.title}</option>))}
                </optgroup>
              </select>
            </div>
          </div>
        );

      case 'split_view':
        return (
          <div className="tool-content">
            <p className="description">View two maps side-by-side.</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'rgba(30, 60, 114, 0.05)', borderRadius: '8px', marginBottom: '20px', border: '1px solid rgba(30, 60, 114, 0.1)' }}>
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
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d' }}>Left Layer</label>
              <select className="tool-select" value={splitLayers.left} onChange={(e) => setSplitLayers(prev => ({ ...prev, left: e.target.value }))} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                {layersConfig.map(layer => (<option key={layer.id} value={layer.id}>{layer.title}</option>))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d' }}>Right Layer</label>
              <select className="tool-select" value={splitLayers.right} onChange={(e) => setSplitLayers(prev => ({ ...prev, right: e.target.value }))} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                {layersConfig.map(layer => (<option key={layer.id} value={layer.id}>{layer.title}</option>))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Extent Synchronization</label>
              <select className="tool-select" value={syncMode} onChange={(e) => setSyncMode(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.1)', background: 'white', fontSize: '13px', fontWeight: '500', color: '#1a2f4d', cursor: 'pointer' }}>
                <option value="both">Sync Both Views (pan + zoom)</option>
                <option value="zoom">Sync Zoom Only</option>
                <option value="none">Independent Views</option>
              </select>
            </div>
          </div>
        );

      case 'search':
        return (
          <div className="tool-content">
            <div className="search-box">
              <input type="text" placeholder={t('searchPlaceholder')} className="tool-input" />
              <button className="primary-btn">{t('searchBtn')}</button>
            </div>
            <p className="hint">{t('searchHint')}</p>
          </div>
        );

      case 'measure':
        return (
          <div className="tool-content">
            <div className="btn-group">
              <button className="tool-btn-item">{t('measureDistance')}</button>
              <button className="tool-btn-item">{t('measureArea')}</button>
            </div>
            <p className="hint">{t('measureHint')}</p>
          </div>
        );

      case 'draw':
        return (
          <div className="tool-content">
            <div className="draw-tools">
              <button className="draw-icon">{t('drawPoint')}</button>
              <button className="draw-icon">{t('drawLine')}</button>
              <button className="draw-icon">{t('drawPolygon')}</button>
            </div>
          </div>
        );

      case 'print':
        return (
          <div className="tool-content">
            <div className="form-group">
              <label>{t('printFormat')}</label>
              <select className="tool-select">
                <option>PDF</option>
                <option>PNG</option>
                <option>JPG</option>
              </select>
            </div>
            <button className="primary-btn full-width">{t('printExportBtn')}</button>
          </div>
        );

      default:
        return (
          <div className="tool-content">
            <p>{t('comingSoon')} <strong>{toolId}</strong> {t('comingSoonSuffix')}</p>
          </div>
        );
    }
  }

  return (
    <div className="app-container" data-swipe-mode={swipeMode}>
      <Header />
      <div style={{ display: isSplitView ? 'none' : 'block', width: '100%', height: '100%' }}>
        <ArcGISMap 
          layerVisibility={layerVisibility} 
          onViewReady={setMapView} 
          is3D={is3D} 
          isSplitMode={isSplitModePersistent}
          activeTool={activeTool}
          blendSettings={activeTool === 'blend' ? blendSettings : null}
          arcadeSettings={activeTool === 'arcade' ? arcadeSettings : null}
          spatialSettings={activeTool === 'spatial_analysis' ? spatialSettings : null}
          onSpatialResult={(dist) => setSpatialSettings(prev => ({ ...prev, distanceResult: dist, status: 'Nearest feature identified' }))}
          onArcadePreview={(val, debug) => setArcadeSettings(prev => ({ ...prev, preview: val, debugInfo: debug }))}
          splitLayers={splitLayers}
          basemap={currentBasemap}
          swipeMode={swipeMode}
          onSwipePositionChange={setSwipeInfo}
        />
      </div>
      
      <DualMapView 
        isSplitView={isSplitView} 
        splitLayers={splitLayers} 
        basemap={currentBasemap} 
        syncMode={syncMode}
        onExit={() => setIsSplitView(false)}
      />
      <MapControls 
        view={mapView} 
        activeTool={activeTool} 
        onToolSelect={setActiveTool} 
        is3D={is3D} 
        onToggle3D={() => setIs3D(!is3D)} 
      />

      {mapView && <MapInfoWidget view={mapView} />}

      <SidePanel
        isOpen={!!activeTool}
        title={getPanelTitle(activeTool)}
        onClose={() => setActiveTool(null)}
        onMinimize={handleMinimize}
      >
        {getPanelContent(activeTool)}
      </SidePanel>

      {!activeTool && (
        <RightToolbar pinnedTools={pinnedTools} getToolIcon={getToolIcon} onRestore={handleRestore} />
      )}

      <BottomToolbar 
        activeTool={activeTool} 
        onToolSelect={handleToolSelect} 
        swipeMode={swipeMode} 
        isSplitView={isSplitView}
        isSplitModePersistent={isSplitModePersistent}
      />

      {/* Swipe Labels — mode-aware positioning (Vertical Divider = L/R, Horizontal Divider = T/B) */}
      {isSplitModePersistent && (() => {
        const isVertical = swipeMode === 'vertical';
        const pos = swipeInfo.position ?? 50;

        const labelBase = {
          // Base styles are now in .swipe-label class in App.css
        };


        // Visual Vertical Line (L/R) corresponds to swipeMode="horizontal"
        // Visual Horizontal Line (T/B) corresponds to swipeMode="vertical"
        const isVisualVertical = swipeMode === 'horizontal';

        // Perfection: Use exactly 20px clearance for vertical, and 60px for horizontal to clear the circular handle
        const clearance = isVisualVertical ? '20px' : '60px';

        const labelA = isVisualVertical
          ? { top: '85px', left: `${pos}%`, transform: `translate3d(calc(-100% - ${clearance}), 0, 0)` } // Left
          : { left: '50%', top: `${pos}%`, transform: `translate3d(-50%, calc(-100% - ${clearance}), 0)` }; // Top

        const labelB = isVisualVertical
          ? { top: '85px', left: `${pos}%`, transform: `translate3d(${clearance}, 0, 0)` } // Right
          : { left: '50%', top: `${pos}%`, transform: `translate3d(-50%, ${clearance}, 0)` }; // Bottom

        const labelAText = isVisualVertical ? 'Left' : 'Top';
        const labelBText = isVisualVertical ? 'Right' : 'Bottom';

        return (
          <div style={{ position: 'fixed', top: '60px', bottom: 0, left: 0, right: 0, zIndex: 1000, pointerEvents: 'none' }}>
            <div className="swipe-label" style={labelA}>
              {labelAText}: {layersConfig.find(l => l.id === splitLayers.left)?.title}
            </div>
            <div className="swipe-label" style={labelB}>
              {labelBText}: {layersConfig.find(l => l.id === splitLayers.right)?.title}
            </div>
          </div>
        );
      })()}
    </div>
  )
}

// ─── Root — wraps everything in LanguageProvider ──────────────────────────────
function App() {
  return (
    <LanguageProvider>
      <AppInner />
    </LanguageProvider>
  );
}

export default App
