import React, { useState, useEffect } from 'react'
import ArcGISMap from './components/MapView'
import BottomToolbar from './components/BottomToolbar'
import SidePanel from './components/SidePanel'
import Header from './components/Header'
import MapControls from './components/MapControls'
import MapInfoWidget from './components/MapInfoWidget'
import { layersConfig } from './layers'
import './App.css'

function App() {
  const [activeTool, setActiveTool] = useState(null)
  const [mapView, setMapView] = useState(null)
  const [layerVisibility, setLayerVisibility] = useState(
    layersConfig.reduce((acc, layer) => ({ ...acc, [layer.id]: layer.visible }), {})
  )

  useEffect(() => {
    const handleClickOutside = (event) => {
      // If a tool is active and the click is outside both the panel and the toolbar, close it.
      if (activeTool && !event.target.closest('.side-panel-container') && !event.target.closest('.bottom-toolbar-container')) {
        setActiveTool(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeTool]);

  const handleToolSelect = (toolId) => {
    setActiveTool(prevTool => prevTool === toolId ? null : toolId)
  }

  const toggleLayer = (id) => {
    setLayerVisibility(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const getPanelContent = (toolId) => {
    switch (toolId) {
      case 'layers':
        return (
          <div className="tool-content">
            <p className="description">Manage map layer visibility:</p>
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
      case 'identify':
        return (
          <div className="tool-content">
            <p>Click on the map to identify features and view detailed information.</p>
            <div className="info-box">Identify mode active</div>
          </div>
        );
      case 'search':
        return (
          <div className="tool-content">
            <div className="search-box">
              <input type="text" placeholder="Search locations..." className="tool-input" />
              <button className="primary-btn">Search</button>
            </div>
            <p className="hint">Try searching for "Bahrain" or "Manama"</p>
          </div>
        );
      case 'measure':
        return (
          <div className="tool-content">
            <div className="btn-group">
              <button className="tool-btn-item">Distance</button>
              <button className="tool-btn-item">Area</button>
            </div>
            <p className="hint">Select a measurement type and click on the map.</p>
          </div>
        );
      case 'draw':
        return (
          <div className="tool-content">
            <div className="draw-tools">
              <button className="draw-icon">Point</button>
              <button className="draw-icon">Line</button>
              <button className="draw-icon">Polygon</button>
            </div>
          </div>
        );
      case 'print':
        return (
          <div className="tool-content">
            <div className="form-group">
              <label>Format</label>
              <select className="tool-select">
                <option>PDF</option>
                <option>PNG</option>
                <option>JPG</option>
              </select>
            </div>
            <button className="primary-btn full-width">Export Map</button>
          </div>
        );
      default:
        return (
          <div className="tool-content">
            <p>Configuration for <strong>{toolId}</strong> will be available soon.</p>
          </div>
        );
    }
  }

  const getPanelTitle = (toolId) => {
    if (!toolId) return '';
    return toolId.charAt(0).toUpperCase() + toolId.slice(1).replace('_', ' ');
  }

  return (
    <div className="app-container">
      <Header />
      <ArcGISMap 
        layerVisibility={layerVisibility} 
        onViewReady={setMapView}
      />
      <MapControls 
        view={mapView} 
        activeTool={activeTool}
        onToolSelect={setActiveTool}
      />
      
      {mapView && <MapInfoWidget view={mapView} />}
      
      <SidePanel 
        isOpen={!!activeTool} 
        title={getPanelTitle(activeTool)} 
        onClose={() => setActiveTool(null)}
      >
        {getPanelContent(activeTool)}
      </SidePanel>

      <BottomToolbar activeTool={activeTool} onToolSelect={handleToolSelect} />
    </div>
  )
}

export default App
