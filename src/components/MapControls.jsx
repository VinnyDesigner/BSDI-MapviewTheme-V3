import React from 'react';
import { Plus, Minus, Home, Info, Hand } from 'lucide-react';
import './MapControls.css';

const MapControls = ({ view, activeTool, onToolSelect }) => {
  const handleZoomIn = () => {
    if (view) {
      view.zoom += 1;
    }
  };

  const handleZoomOut = () => {
    if (view) {
      view.zoom -= 1;
    }
  };

  const handleHome = () => {
    if (view) {
      view.goTo({
        center: [-98, 39],
        zoom: 4
      });
    }
  };

  return (
    <div className="map-controls-container">
      <div className="map-control-group">
        <button className="map-control-btn group-btn" onClick={handleZoomIn} title="Zoom In">
          <Plus size={18} />
        </button>
        <div className="group-divider" />
        <button className="map-control-btn group-btn" onClick={handleZoomOut} title="Zoom Out">
          <Minus size={18} />
        </button>
      </div>

      <button className="map-control-btn" onClick={handleHome} title="Home">
        <Home size={18} />
      </button>
      
      <button 
        className={`map-control-btn ${activeTool === 'identify' ? 'active' : ''}`} 
        onClick={() => onToolSelect('identify')}
        title="Identify"
      >
        <Info size={18} />
      </button>

      <button 
        className={`map-control-btn ${!activeTool ? 'active' : ''}`} 
        onClick={() => onToolSelect(null)}
        title="Pan"
      >
        <Hand size={18} />
      </button>
    </div>
  );
};

export default MapControls;
