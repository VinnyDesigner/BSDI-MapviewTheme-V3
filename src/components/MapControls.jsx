import React from 'react';
import { Plus, Minus, Home, Info, Hand, Map } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import './MapControls.css';

const MapControls = ({ view, activeTool, onToolSelect, is3D, onToggle3D }) => {
  const { t } = useLanguage();

  const handleZoomIn  = () => { if (view) view.zoom += 1; };
  const handleZoomOut = () => { if (view) view.zoom -= 1; };
  const handleHome    = () => {
    if (view) view.goTo({ center: [50.55, 26.22], zoom: 9 });
  };
  

  return (
    <div className="map-controls-container">
      {/* 1. Home */}
      <button className="map-control-btn square" onClick={handleHome} title={t('home')}>
        <Home size={18} />
      </button>

      {/* 2. Identify */}
      <button
        className={`map-control-btn square ${activeTool === 'identify' ? 'active' : ''}`}
        onClick={() => onToolSelect('identify')}
        title={t('identify')}
      >
        <Info size={18} />
      </button>

      {/* 3. 2D / 3D Toggle */}
      <button
        className={`map-control-btn square ${is3D ? 'active' : ''}`}
        onClick={onToggle3D}
        title={is3D ? (t('view2D') || '2D View') : (t('view3D') || '3D View')}
      >
        <span className="toggle-text">{is3D ? '2D' : '3D'}</span>
      </button>

      {/* 4. Basemap */}
      <button 
        className={`map-control-btn square ${activeTool === 'basemap' ? 'active' : ''}`} 
        onClick={() => onToolSelect('basemap')} 
        title="Basemap"
      >
        <Map size={18} />
      </button>

      {/* 5. Pan */}
      <button
        className={`map-control-btn square ${!activeTool ? 'active' : ''}`}
        onClick={() => onToolSelect(null)}
        title={t('pan')}
      >
        <Hand size={18} />
      </button>

      <div className="control-divider" />

      {/* 6. Zoom Group */}
      <div className="map-control-group-square">
        <button className="map-control-btn sub-btn" onClick={handleZoomIn} title={t('zoomIn')}>
          <Plus size={18} />
        </button>
        <div className="inner-divider" />
        <button className="map-control-btn sub-btn" onClick={handleZoomOut} title={t('zoomOut')}>
          <Minus size={18} />
        </button>
      </div>
    </div>
  );
};

export default MapControls;
