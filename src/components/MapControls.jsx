import React from 'react';
import { Plus, Minus, Home, Info, Hand } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import './MapControls.css';

const MapControls = ({ view, activeTool, onToolSelect }) => {
  const { t } = useLanguage();

  const handleZoomIn  = () => { if (view) view.zoom += 1; };
  const handleZoomOut = () => { if (view) view.zoom -= 1; };
  const handleHome    = () => {
    if (view) view.goTo({ center: [50.55, 26.22], zoom: 9 });
  };

  return (
    <div className="map-controls-container">
      <div className="map-control-group">
        {/* ✅ Static button titles — translated */}
        <button className="map-control-btn group-btn" onClick={handleZoomIn} title={t('zoomIn')}>
          <Plus size={18} />
        </button>
        <div className="group-divider" />
        <button className="map-control-btn group-btn" onClick={handleZoomOut} title={t('zoomOut')}>
          <Minus size={18} />
        </button>
      </div>

      <button className="map-control-btn" onClick={handleHome} title={t('home')}>
        <Home size={18} />
      </button>

      <button
        className={`map-control-btn ${activeTool === 'identify' ? 'active' : ''}`}
        onClick={() => onToolSelect('identify')}
        title={t('identify')}
      >
        <Info size={18} />
      </button>

      <button
        className={`map-control-btn ${!activeTool ? 'active' : ''}`}
        onClick={() => onToolSelect(null)}
        title={t('pan')}
      >
        <Hand size={18} />
      </button>
    </div>
  );
};

export default MapControls;
