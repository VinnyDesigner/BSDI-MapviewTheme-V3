import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { 
  Ruler, 
  Square, 
  RotateCcw, 
  X, 
  Map as MapIcon,
  ChevronDown,
  Hash
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import SketchViewModel from '@arcgis/core/widgets/Sketch/SketchViewModel';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import TextSymbol from '@arcgis/core/symbols/TextSymbol';
import Graphic from '@arcgis/core/Graphic';
import './MeasurePanel.css';

const AREA_UNITS = [
  { id: 'square-meters', label: 'Sq. Meters', unit: 'square-meters' },
  { id: 'square-kilometers', label: 'Sq. Kilometre', unit: 'square-kilometers' },
  { id: 'square-miles', label: 'Sq. Miles', unit: 'square-miles' },
  { id: 'square-feet', label: 'Sq. Feet', unit: 'square-feet' },
  { id: 'hectares', label: 'Hectares', unit: 'hectares' },
];

const DISTANCE_UNITS = [
  { id: 'meters', label: 'Meters', unit: 'meters' },
  { id: 'kilometers', label: 'Kilometres', unit: 'kilometers' },
  { id: 'miles', label: 'Miles', unit: 'miles' },
  { id: 'feet', label: 'Feet', unit: 'feet' },
  { id: 'nautical-miles', label: 'Nautical Miles', unit: 'nautical-miles' },
];

const MeasurePanel = ({ view }) => {
  const { t, lang } = useLanguage();
  const [activeMode, setActiveMode] = useState(null); // 'area', 'distance'
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [results, setResults] = useState(null);
  const [wkid, setWkid] = useState('4326');

  const graphicsLayerRef = useRef(null);
  const labelLayerRef = useRef(null);
  const sketchVMRef = useRef(null);
  const selectedUnitRef = useRef(selectedUnit);

  useEffect(() => {
    selectedUnitRef.current = selectedUnit;
  }, [selectedUnit]);

  // Initialize Layers and SketchVM
  useEffect(() => {
    if (!view) return;

    // Set WKID
    if (view.spatialReference) {
      setWkid(view.spatialReference.wkid || '3857');
    }

    const graphicsLayer = new GraphicsLayer({ title: "Measure Graphics", id: "measure_graphics_layer" });
    const labelLayer = new GraphicsLayer({ title: "Measure Labels", id: "measure_labels_layer" });
    view.map.addMany([graphicsLayer, labelLayer]);
    graphicsLayerRef.current = graphicsLayer;
    labelLayerRef.current = labelLayer;

    const svm = new SketchViewModel({
      view: view,
      layer: graphicsLayer,
      updateOnGraphicClick: false,
      pointSymbol: { type: "simple-marker", style: "circle", color: [223, 38, 28, 1], size: "8px", outline: { color: [255, 255, 255], width: 1.5 } },
      polylineSymbol: { type: "simple-line", color: [223, 38, 28, 1], width: "2.5px", style: "solid" },
      polygonSymbol: { type: "simple-fill", color: [223, 38, 28, 0.15], outline: { color: [223, 38, 28, 1], width: 2, style: "dash" } }
    });

    svm.on(["create", "update"], (event) => {
      const graphic = event.graphic || (event.graphics && event.graphics[0]);
      if (!graphic) return;

      calculateMeasurements(graphic);
      
      if (event.state === "complete") {
        // Keeping graphics visible is default SketchViewModel behavior if we don't clear the layer
      }
    });

    sketchVMRef.current = svm;

    return () => {
      console.log("Cleanup: MeasurePanel");
      if (svm) svm.destroy();
      if (view && view.map) {
        view.map.removeMany([graphicsLayer, labelLayer]);
      }
    };
  }, [view]);

  const getCorrespondingDistanceUnit = (areaUnit, perimeterInMeters) => {
    if (areaUnit === 'square-meters') return 'meters';
    if (areaUnit === 'square-kilometers') return 'kilometers';
    if (areaUnit === 'square-miles') return 'miles';
    if (areaUnit === 'square-feet') return 'feet';
    if (areaUnit === 'hectares') {
      if (perimeterInMeters && perimeterInMeters > 5000) {
        return 'kilometers';
      }
      return 'meters';
    }
    return 'meters';
  };

  const calculateMeasurements = (graphic) => {
    if (!graphic.geometry) return;
    const geometry = graphic.geometry;
    const labels = [];
    const currentUnit = selectedUnitRef.current || (activeMode === 'area' ? 'square-meters' : 'meters');

    if (geometry.type === "polyline") {
      const totalDist = geometryEngine.geodesicLength(geometry, currentUnit);
      setResults({ distance: totalDist });
      
      // Add label at the end point
      const lastPath = geometry.paths[0];
      const lastPoint = geometry.getPoint(0, lastPath.length - 1);
      labels.push(createLabelGraphic(lastPoint, `${totalDist.toFixed(2)} ${getUnitShortLabel(currentUnit)}`));
    } 
    else if (geometry.type === "polygon") {
      const area = geometryEngine.geodesicArea(geometry, currentUnit);
      const perimeterInMeters = geometryEngine.geodesicLength(geometry, 'meters');
      const distUnit = getCorrespondingDistanceUnit(currentUnit, perimeterInMeters);
      const perimeter = geometryEngine.geodesicLength(geometry, distUnit);
      
      setResults({ 
        area: Math.abs(area), 
        perimeter: perimeter,
        perimeterUnit: distUnit
      });

      // Add label at centroid
      const areaLabel = `${Math.abs(area).toFixed(2)} ${getUnitShortLabel(currentUnit)}${currentUnit === 'hectares' ? '' : '²'}`;
      const periLabel = `${perimeter.toFixed(2)} ${getUnitShortLabel(distUnit)}`;
      labels.push(createLabelGraphic(geometry.centroid, `${areaLabel}\nPerimeter: ${periLabel}`));
    }

    // Update Label Layer
    if (labelLayerRef.current) {
      labelLayerRef.current.removeAll();
      labelLayerRef.current.addMany(labels);
    }
  };

  const createLabelGraphic = (point, text) => {
    return new Graphic({
      geometry: point,
      symbol: new TextSymbol({
        text: text,
        color: "white",
        haloColor: "#df261c",
        haloSize: "2px",
        font: { size: 12, weight: "bold", family: "Inter" },
        verticalAlignment: "bottom",
        yoffset: 10
      })
    });
  };

  const getUnitShortLabel = (unit) => {
    if (unit === 'square-meters') return 'm';
    if (unit === 'square-kilometers') return 'km';
    if (unit === 'square-miles') return 'mi';
    if (unit === 'square-feet') return 'ft';
    if (unit === 'hectares') return 'ha';
    
    if (unit === 'meters') return 'm';
    if (unit === 'kilometers') return 'km';
    if (unit === 'miles') return 'mi';
    if (unit === 'feet') return 'ft';
    if (unit === 'nautical-miles') return 'nm';

    const allUnits = [...AREA_UNITS, ...DISTANCE_UNITS];
    const found = allUnits.find(u => u.unit === unit);
    return found ? found.label.replace('Sq. ', '').replace('Square ', '') : unit;
  };

  const handleModeChange = (mode) => {
    if (mode === 'reset') {
      handleReset();
      return;
    }

    setActiveMode(mode);
    setResults(null);
    labelLayerRef.current.removeAll();
    graphicsLayerRef.current.removeAll();

    const tool = mode === 'area' ? 'polygon' : 'polyline';
    const initialUnit = mode === 'area' ? 'square-meters' : 'meters';
    setSelectedUnit(initialUnit);
    selectedUnitRef.current = initialUnit;
    
    sketchVMRef.current.create(tool);
  };

  const handleNewMeasurement = () => {
    labelLayerRef.current.removeAll();
    graphicsLayerRef.current.removeAll();
    setResults(null);
    const tool = activeMode === 'area' ? 'polygon' : 'polyline';
    sketchVMRef.current.create(tool);
  };

  const handleReset = () => {
    setActiveMode(null);
    setResults(null);
    labelLayerRef.current.removeAll();
    graphicsLayerRef.current.removeAll();
    sketchVMRef.current.cancel();
  };

  return (
    <div className="measure-panel-wrapper" dir={lang === 'AR' ? 'rtl' : 'ltr'}>
      {/* Fixed Header Tools */}
      <div className="measure-header-tools">
        <div className="measure-mode-grid">
          <button 
            className={`measure-card ${activeMode === 'area' ? 'active' : ''}`}
            onClick={() => handleModeChange('area')}
          >
            <div className="card-icon"><Square size={20} /></div>
            <span>{t('measureArea')}</span>
          </button>
          <button 
            className={`measure-card ${activeMode === 'distance' ? 'active' : ''}`}
            onClick={() => handleModeChange('distance')}
          >
            <div className="card-icon"><Ruler size={20} /></div>
            <span>{t('measureDistance')}</span>
          </button>
          <button 
            className="measure-card reset"
            onClick={() => handleModeChange('reset')}
          >
            <div className="card-icon"><RotateCcw size={20} /></div>
            <span>{t('measureReset')}</span>
          </button>
        </div>
      </div>

      <div className="measure-content-scroll">
        <AnimatePresence>
          {activeMode && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="measure-details"
            >
              {/* Coordinate System */}
              <div className="measure-section">
                <label className="section-label">{t('measureCoordSystem')}</label>
                <div className="unit-select-wrapper">
                  <select 
                    className="measure-select"
                    value={wkid}
                    onChange={(e) => setWkid(e.target.value)}
                    dir="ltr"
                  >
                    <option value="4326">WKID: 4326 Lat Long</option>
                    <option value="20439">WKID: 20439 UTM 39N</option>
                    <option value="3857">WKID: 3857 Web Mercator</option>
                    <option value="102100">WKID: 102100 Web Mercator</option>
                  </select>
                  <ChevronDown className="select-arrow" size={16} />
                </div>
              </div>

              {/* Unit Selection */}
              <div className="measure-section">
                <label className="section-label">{activeMode === 'area' ? t('measureAreaUnit') : t('measureDistUnit')}</label>
                <div className="unit-select-wrapper">
                  <select 
                    className="measure-select"
                    value={selectedUnit}
                    onChange={(e) => {
                      const newUnit = e.target.value;
                      setSelectedUnit(newUnit);
                      selectedUnitRef.current = newUnit;
                      if (graphicsLayerRef.current && graphicsLayerRef.current.graphics.length > 0) {
                        calculateMeasurements(graphicsLayerRef.current.graphics.getItemAt(0));
                      }
                    }}
                    dir="ltr"
                  >
                    {(activeMode === 'area' ? AREA_UNITS : DISTANCE_UNITS).map(u => (
                      <option key={u.id} value={u.unit}>{u.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="select-arrow" size={16} />
                </div>
              </div>

              {/* Results Display */}
              <div className="results-card">
                <span className="section-label">{t('measureResults')}</span>
                <div className="results-list">
                  {activeMode === 'area' ? (
                    <>
                      <div className="result-item">
                        <span className="res-label">{t('measureArea')}</span>
                        <span className="res-value" dir="ltr">
                          {results ? results.area.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0.00'} 
                          <span className="res-unit"> {getUnitShortLabel(selectedUnit)}{selectedUnit === 'hectares' ? '' : '²'}</span>
                        </span>
                      </div>
                      <div className="result-item">
                        <span className="res-label">{t('measurePerimeter')}</span>
                        <span className="res-value" dir="ltr">
                          {results ? results.perimeter.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0.00'} 
                          <span className="res-unit"> {results && results.perimeterUnit ? getUnitShortLabel(results.perimeterUnit) : 'm'}</span>
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="result-item">
                      <span className="res-label">{t('measureTotalDist')}</span>
                      <span className="res-value" dir="ltr">
                        {results ? results.distance.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0.00'} 
                        <span className="res-unit"> {getUnitShortLabel(selectedUnit)}</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Persistent Footer Actions */}
      <div className="measure-footer-wrapper">
        <AnimatePresence>
          {activeMode && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="measure-footer-content"
            >
              <button className="new-measure-btn" onClick={handleNewMeasurement}>
                {t('measureNew')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default MeasurePanel;
