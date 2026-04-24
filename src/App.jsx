import React, { useState, useEffect } from 'react'
import ArcGISMap from './components/MapView'
import BottomToolbar from './components/BottomToolbar'
import SidePanel from './components/SidePanel'
import Header from './components/Header'
import MapControls from './components/MapControls'
import MapInfoWidget from './components/MapInfoWidget'
import { layersConfig } from './layers'
import { LanguageProvider, useLanguage } from './context/LanguageContext'
import { translations } from './i18n/translations'
import './App.css'

import { 
  Layers, Search, Navigation, Ruler, Pencil,
  Box, Database, Globe, Printer, Bookmark, Info
} from 'lucide-react';

import RightToolbar from './components/RightToolbar'

// ─── Inner app — has access to LanguageContext ────────────────────────────────
function AppInner() {
  const { t, lang } = useLanguage();

  const [activeTool, setActiveTool]     = useState(null)
  const [pinnedTools, setPinnedTools]   = useState([])
  const [mapView, setMapView]           = useState(null)
  const [layerVisibility, setLayerVisibility] = useState(
    layersConfig.reduce((acc, layer) => ({ ...acc, [layer.id]: layer.visible }), {})
  )

  // ── Tool icon lookup ────────────────────────────────────────────────────────
  const getToolIcon = (toolId) => {
    const icons = {
      layers: <Layers size={16} />, search: <Search size={16} />,
      navigation: <Navigation size={16} />, measure: <Ruler size={16} />,
      draw: <Pencil size={16} />, cad: <Box size={16} />,
      data_request: <Database size={16} />, external_data: <Globe size={16} />,
      print: <Printer size={16} />, bookmark: <Bookmark size={16} />,
      identify: <Info size={16} />,
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
    if (toolId === activeTool) { setActiveTool(null); return; }
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
    <div className="app-container">
      <Header />
      <ArcGISMap layerVisibility={layerVisibility} onViewReady={setMapView} />
      <MapControls view={mapView} activeTool={activeTool} onToolSelect={setActiveTool} />

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

      <BottomToolbar activeTool={activeTool} onToolSelect={handleToolSelect} />
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
