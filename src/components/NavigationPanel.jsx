import React, { useState, useEffect, useRef } from 'react';
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
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Point from '@arcgis/core/geometry/Point';
import Graphic from '@arcgis/core/Graphic';
import * as projection from '@arcgis/core/geometry/projectionUtils';
import './NavigationPanel.css';

const NavigationPanel = ({ view }) => {
  const [scaleValue, setScaleValue] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [hasCaptured, setHasCaptured] = useState(false);
  const [error, setError] = useState('');
  
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

        setManualLat(displayPoint.y.toFixed(6));
        setManualLng(displayPoint.x.toFixed(6));
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
      setError('Please enter a valid positive scale value.');
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
    setHasCaptured(false);
    setIsCapturing(false);
    setError('');
    if (graphicsLayerRef.current) {
      graphicsLayerRef.current.removeAll();
    }
  };

  return (
    <div className="nav-panel-wrapper">
      <div className="nav-content-scroll">
        {/* Section 1: Zoom to Scale */}
        <div className="nav-card-section">
          <div className="section-header">
            <Maximize size={16} className="section-icon" />
            <h3 className="section-title">Zoom to Scale</h3>
          </div>
          
          <div className="scale-input-row">
            <input 
              type="text" 
              className="tool-input scale-input-field"
              placeholder="e.g. 1000 or 1:1000"
              value={scaleValue}
              onChange={(e) => setScaleValue(e.target.value)}
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
            <h3 className="section-title">Go to XY</h3>
          </div>
          
          <p className="instruction-text">Click on the map to grab coordinates</p>

          <button 
            className={`capture-btn ${isCapturing ? 'active' : ''}`}
            onClick={() => setIsCapturing(!isCapturing)}
          >
            {isCapturing ? (
              <><Target size={16} className="animate-pulse" /> Capturing...</>
            ) : (
              <><MousePointer2 size={16} /> Capture Coordinates</>
            )}
          </button>

          {/* Coordinate Table Result */}
          <AnimatePresence>
            {hasCaptured && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="coordinate-table-card"
              >
                <div className="table-header">
                  <span className="table-title">Coordinate System</span>
                  <span className="table-wkid">WKID: 4326 Lat Long</span>
                </div>
                <div className="table-body">
                  <div className="table-row">
                    <span className="row-label">Latitude</span>
                    <span className="row-value">{manualLat}</span>
                  </div>
                  <div className="table-row">
                    <span className="row-label">Longitude</span>
                    <span className="row-value">{manualLng}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="nav-footer">
        <button className="clear-all-btn" onClick={handleClearAll}>
          <RotateCcw size={16} /> Clear All
        </button>
      </div>
    </div>
  );
};

export default NavigationPanel;
