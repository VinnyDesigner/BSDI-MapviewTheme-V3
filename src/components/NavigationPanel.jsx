import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { 
  Navigation as NavIcon, 
  MapPin, 
  Maximize, 
  X, 
  Hash,
  ChevronDown,
  AlertCircle,
  RotateCcw,
  Target,
  MousePointer2,
  Navigation,
  ChevronRight,
  ArrowRight,
  Search,
  Copy,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Point from '@arcgis/core/geometry/Point';
import Graphic from '@arcgis/core/Graphic';
import * as projection from '@arcgis/core/geometry/projectionUtils';
import './NavigationPanel.css';

const NavigationPanel = ({ view }) => {
  const { t, lang } = useLanguage();
  const [scaleValue, setScaleValue] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [hasCaptured, setHasCaptured] = useState(false);
  const [error, setError] = useState('');
  const [coordinateSystem, setCoordinateSystem] = useState('WGS84');
  const [coordinateInput, setCoordinateInput] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const graphicsLayerRef = useRef(null);
  const clickHandleRef = useRef(null);

  useEffect(() => {
    if (!view) return;

    const layer = new GraphicsLayer({ title: "Navigation Marker", id: "navigation_marker_layer" });
    view.map.add(layer);
    graphicsLayerRef.current = layer;

    // Load projection engine
    projection.load();

    return () => {
      view.map.remove(layer);
      if (clickHandleRef.current) clickHandleRef.current.remove();
    };
  }, [view]);

  // Handle Map Capture
  useEffect(() => {
    if (isCapturing && view) {
      view.cursor = "crosshair";
      clickHandleRef.current = view.on("click", (event) => {
        event.stopPropagation();
        const mapPoint = event.mapPoint;
        
        let displayPoint = mapPoint;
        if (mapPoint.spatialReference.wkid !== 4326) {
          if (projection.isLoaded()) {
            displayPoint = projection.project(mapPoint, { wkid: 4326 });
          }
        }

        const lat = displayPoint.y.toFixed(6);
        const lng = displayPoint.x.toFixed(6);
        
        setManualLat(lat);
        setManualLng(lng);
        setCoordinateInput(`${lat}, ${lng}`);
        setHasCaptured(true);
        addMarker(mapPoint);
        
        setIsCapturing(false);
        view.cursor = "default";

        view.goTo({
          target: mapPoint,
          zoom: 15
        }, { duration: 1000 });
      });
    } else if (view) {
      view.cursor = "default";
      if (clickHandleRef.current) {
        clickHandleRef.current.remove();
        clickHandleRef.current = null;
      }
    }
  }, [isCapturing, view]);

  const addMarker = (point) => {
    if (!graphicsLayerRef.current) return;
    graphicsLayerRef.current.removeAll();
    const marker = new Graphic({
      geometry: point,
      symbol: {
        type: "picture-marker",
        url: "https://static.arcgis.com/images/Symbols/Shapes/RedPin1LargeB.png",
        width: "32px",
        height: "32px"
      }
    });
    graphicsLayerRef.current.add(marker);
  };

  const handleZoomToScale = () => {
    if (!scaleValue) return;
    const rawValue = scaleValue.replace('1:', '').trim();
    const scale = parseFloat(rawValue);
    if (isNaN(scale) || scale <= 0) {
      setError(t('navInvalidScale'));
      return;
    }
    setError('');
    view.goTo({
      scale: scale
    }, { duration: 800 });
  };

  const handleClearAll = () => {
    setScaleValue('');
    setManualLat('');
    setManualLng('');
    setCoordinateInput('');
    setHasCaptured(false);
    setIsCapturing(false);
    setError('');
    if (graphicsLayerRef.current) {
      graphicsLayerRef.current.removeAll();
    }
  };

  const handleCopy = () => {
    if (!manualLat || !manualLng) return;
    const text = `Latitude: ${manualLat}\nLongitude: ${manualLng}`;
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const systems = ['WGS84', 'Web Mercator', 'UTM 39N', 'EPSG:20439'];

  return (
    <div className="nav-panel-wrapper" dir={lang === 'AR' ? 'rtl' : 'ltr'}>
      <div className="nav-content-scroll">
        {/* Section 1: Zoom to Scale */}
        <div className="nav-card-section">
          <div className="section-header">
            <Maximize size={16} className="section-icon" />
            <h3 className="section-title">{t('navZoomToScale')}</h3>
          </div>
          
          <div className="scale-input-row">
            <input 
              type="text" 
              className="tool-input scale-input-field"
              placeholder={t('navScalePlaceholder')}
              value={scaleValue}
              onChange={(e) => setScaleValue(e.target.value)}
              dir="ltr"
            />
            <button 
              className="zoom-icon-btn" 
              onClick={handleZoomToScale}
              disabled={!scaleValue.trim()}
            >
              <Search size={18} />
            </button>
          </div>

          {error && (
            <div className="error-message mini">
              <AlertCircle size={12} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="nav-divider-horizontal" />

        {/* Section 2: Go to XY */}
        <div className="nav-card-section">
          <div className="section-header">
            <MapPin size={16} className="section-icon" />
            <h3 className="section-title">{t('navGoToXY')}</h3>
          </div>
          
          <div className="xy-form-container">
            {/* Top Row: Dropdown + Capture */}
            <div className="xy-top-row">
              <div className="custom-dropdown-container" dir="ltr">
                <button 
                  className="dropdown-trigger"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                  <span>{coordinateSystem}</span>
                  <ChevronDown size={14} className={`dropdown-arrow ${isDropdownOpen ? 'open' : ''}`} />
                </button>
                
                <AnimatePresence>
                  {isDropdownOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="dropdown-menu"
                    >
                      {systems.map(s => (
                        <div 
                          key={s} 
                          className={`dropdown-item ${coordinateSystem === s ? 'active' : ''}`}
                          onClick={() => {
                            setCoordinateSystem(s);
                            setIsDropdownOpen(false);
                          }}
                        >
                          {s}
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button 
                className={`compact-capture-btn ${isCapturing ? 'active' : ''}`}
                onClick={() => setIsCapturing(!isCapturing)}
                title={t('navCapture')}
              >
                {isCapturing ? (
                  <Target size={18} className="animate-pulse" />
                ) : (
                  <MousePointer2 size={18} />
                )}
                <span>{t('navCapture')}</span>
              </button>
            </div>

            {/* High-Fidelity Result Table Card */}

            {/* High-Fidelity Result Table Card */}
            <AnimatePresence>
              {hasCaptured && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="coordinate-table-card"
                >
                  <div className="table-header">
                    <span className="table-title">{t('navCoordSystem')}</span>
                    <button 
                      className={`header-copy-btn ${isCopied ? 'success' : ''}`} 
                      onClick={handleCopy}
                      title="Copy coordinates"
                    >
                      {isCopied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                  <div className="table-body">
                    <div className="table-row">
                      <span className="row-label">{t('navLatitude')}</span>
                      <span className="row-value" dir="ltr">{manualLat}</span>
                    </div>
                    <div className="table-row">
                      <span className="row-label">{t('navLongitude')}</span>
                      <span className="row-value" dir="ltr">{manualLng}</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="nav-footer">
        <button className="clear-all-btn" onClick={handleClearAll}>
          <RotateCcw size={16} /> {t('navClearAll')}
        </button>
      </div>
    </div>
  );
};

export default NavigationPanel;
