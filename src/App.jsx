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
      identify: <Info size={16} />, split: <Columns2 size={16} />,
      split_view: <i className="material-icons" style={{ fontSize: '16px' }}>splitscreen</i>,
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
                    {/* ✅ Raw dynamic data — NOT translated */}
                    <span className="layer-name">{layer.title}</span>
                  </label>
                </div>
              ))}
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
            
            {/* Enable / Disable toggle */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              padding: '12px',
              background: 'rgba(30, 60, 114, 0.05)',
              borderRadius: '8px',
              marginBottom: '20px',
              border: '1px solid rgba(30, 60, 114, 0.1)'
            }}>
              <span style={{ fontWeight: '700', color: '#1a2f4d', fontSize: '14px' }}>
                {isSplitModePersistent ? 'Swipe Active' : 'Enable Swipe'}
              </span>
              <button 
                onClick={() => setIsSplitModePersistent(!isSplitModePersistent)}
                className="primary-btn"
                style={{ 
                  background: isSplitModePersistent 
                    ? '#cbd5e1' // Professional Ash color for "Disable" state
                    : 'linear-gradient(135deg, #df261c, #002D5D)', // Icon Gradient for "Enable" state
                  color: isSplitModePersistent ? '#1a2f4d' : 'white',
                  padding: '8px 18px',
                  fontSize: '13px',
                  fontWeight: '600', // Semibold
                  borderRadius: '10px',
                  border: 'none',
                  outline: 'none',
                  transition: 'all 0.3s ease',
                  cursor: 'pointer',
                  boxShadow: isSplitModePersistent ? 'none' : '0 4px 12px rgba(223, 38, 28, 0.2)'
                }}
                className="no-stroke-btn" // Added a custom class just in case primary-btn has forced borders
              >
                {isSplitModePersistent ? 'Disable' : 'Enable'}
              </button>
            </div>

            {/* ── Swipe Direction Toggle (ABOVE layer selects) ── */}
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
                    style={{
                      flex: 1,
                      padding: '7px 0',
                      borderRadius: '6px',
                      border: '1.5px solid',
                      borderColor: swipeMode === id ? '#1e3c72' : '#e2e8f0',
                      background: swipeMode === id ? 'linear-gradient(135deg, #1e3c72, #2a5298)' : 'white',
                      color: swipeMode === id ? 'white' : '#1a2f4d',
                      fontWeight: '700',
                      fontSize: '11px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Layer selects */}
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d' }}>{t('splitLeftLayer')}</label>
              <select 
                className="tool-select" 
                value={splitLayers.left}
                onChange={(e) => setSplitLayers(prev => ({ ...prev, left: e.target.value }))}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}
              >
                <optgroup label={t('splitLayerLabel')}>
                  {layersConfig.filter(l => !l.time).map(layer => (
                    <option key={layer.id} value={layer.id}>{layer.title}</option>
                  ))}
                </optgroup>
                <optgroup label={t('splitTimeLabel')}>
                  {layersConfig.filter(l => l.time).map(layer => (
                    <option key={layer.id} value={layer.id}>{layer.title}</option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div className="form-group">
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d' }}>{t('splitRightLayer')}</label>
              <select 
                className="tool-select" 
                value={splitLayers.right}
                onChange={(e) => setSplitLayers(prev => ({ ...prev, right: e.target.value }))}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}
              >
                <optgroup label={t('splitLayerLabel')}>
                  {layersConfig.filter(l => !l.time).map(layer => (
                    <option key={layer.id} value={layer.id}>{layer.title}</option>
                  ))}
                </optgroup>
                <optgroup label={t('splitTimeLabel')}>
                  {layersConfig.filter(l => l.time).map(layer => (
                    <option key={layer.id} value={layer.id}>{layer.title}</option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>
        );

      case 'split_view':
        return (
          <div className="tool-content">
            <p className="description">View two maps side-by-side.</p>
            
            {/* Enable / Disable toggle */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              padding: '12px',
              background: 'rgba(30, 60, 114, 0.05)',
              borderRadius: '8px',
              marginBottom: '20px',
              border: '1px solid rgba(30, 60, 114, 0.1)'
            }}>
              <span style={{ fontWeight: '700', color: '#1a2f4d', fontSize: '14px' }}>
                {isSplitView ? 'Split View Active' : 'Enable Split View'}
              </span>
              <button 
                onClick={() => {
                  setIsSplitView(!isSplitView);
                  if (isSplitModePersistent) setIsSplitModePersistent(false); // turn off swipe
                }}
                className="no-stroke-btn"
                style={{ 
                  background: isSplitView ? '#cbd5e1' : 'linear-gradient(135deg, #df261c, #002D5D)', 
                  color: isSplitView ? '#1a2f4d' : 'white',
                  padding: '8px 18px',
                  fontSize: '13px',
                  fontWeight: '600',
                  borderRadius: '10px',
                  border: 'none',
                  outline: 'none',
                  transition: 'all 0.3s ease',
                  cursor: 'pointer',
                  boxShadow: isSplitView ? 'none' : '0 4px 12px rgba(223, 38, 28, 0.2)'
                }}
              >
                {isSplitView ? 'Disable' : 'Enable'}
              </button>
            </div>

            {/* Layer selects */}
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d' }}>Left Layer</label>
              <select 
                className="tool-select" 
                value={splitLayers.left}
                onChange={(e) => setSplitLayers(prev => ({ ...prev, left: e.target.value }))}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}
              >
                {layersConfig.map(layer => (
                  <option key={layer.id} value={layer.id}>{layer.title}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d' }}>Right Layer</label>
              <select 
                className="tool-select" 
                value={splitLayers.right}
                onChange={(e) => setSplitLayers(prev => ({ ...prev, right: e.target.value }))}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}
              >
                {layersConfig.map(layer => (
                  <option key={layer.id} value={layer.id}>{layer.title}</option>
                ))}
              </select>
            </div>

            {/* Extent Synchronization */}
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>
                Extent Synchronization
              </label>
              <select 
                className="tool-select" 
                value={syncMode}
                onChange={(e) => setSyncMode(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '10px', 
                  borderRadius: '8px', 
                  border: '1px solid rgba(0,0,0,0.1)',
                  background: 'white',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#1a2f4d',
                  cursor: 'pointer'
                }}
              >
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
              {/* PDF/PNG/JPG are technical format names — kept as-is */}
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
