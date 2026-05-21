import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import * as projection from "@arcgis/core/geometry/projectionUtils";
import SpatialReference from "@arcgis/core/geometry/SpatialReference";
import './MapInfoWidget.css';

const COORD_FORMATS = {
  WEBMERCATOR: 'webmercator',
  WGS84_DD: 'wgs84_dd',
  WGS84_DMS: 'wgs84_dms',
  DLTM: 'dltm',
  AIN_EL_ABD: 'ain_el_abd'
};

const STANDARD_SCALES = [
  250, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000
];

// Helper to convert decimal degrees to DMS (Degrees Minutes Seconds)
const toDMS = (val, isLat) => {
  const absolute = Math.abs(val);
  const degrees = Math.floor(absolute);
  const minutesNotTruncated = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesNotTruncated);
  const seconds = Math.round((minutesNotTruncated - minutes) * 60);
  const direction = isLat
    ? (val >= 0 ? "N" : "S")
    : (val >= 0 ? "E" : "W");
  return `${degrees}° ${minutes}' ${seconds}" ${direction}`;
};



// Mini Dropdown Component
const MiniSelect = ({ options, value, displayValue, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const clickOut = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', clickOut);
    return () => document.removeEventListener('mousedown', clickOut);
  }, []);

  return (
    <div className="mini-select-container" ref={containerRef}>
      <div className="mini-select-trigger" onClick={() => setIsOpen(!isOpen)}>
        <span className="mini-select-value">{displayValue || value}</span>
        <span className="mini-select-arrow">▾</span>
      </div>
      {isOpen && (
        <div className="mini-select-dropdown">
          {options.map((opt) => (
            <div
              key={opt.value}
              className={`mini-select-option ${opt.value === value ? 'active' : ''}`}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Scale Dropdown & Manual Input Component
const ScaleSelect = ({ options, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const containerRef = useRef(null);

  // Sync state with parent's active map scale (e.g. from mouse wheel, zoom buttons)
  useEffect(() => {
    setInputValue(`1:${value.toLocaleString('en-US')}`);
  }, [value]);

  useEffect(() => {
    const clickOut = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', clickOut);
    return () => document.removeEventListener('mousedown', clickOut);
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      submitValue();
      setIsOpen(false);
      e.target.blur();
    }
  };

  const handleBlur = () => {
    submitValue();
  };

  const submitValue = () => {
    const raw = inputValue.trim();
    let clean = raw;
    if (clean.toLowerCase().startsWith('1:')) {
      clean = clean.substring(2);
    }
    clean = clean.replace(/,/g, '').trim();

    const parsed = parseFloat(clean);
    if (!isNaN(parsed) && parsed > 0 && isFinite(parsed)) {
      onChange(parsed);
    } else {
      // Revert to current formatted value
      setInputValue(`1:${value.toLocaleString('en-US')}`);
    }
  };

  return (
    <div className="mini-select-container scale-select-container" ref={containerRef}>
      <div className="mini-select-trigger scale-select-trigger" onClick={(e) => {
        // If clicking the container/arrow but not the input directly, toggle dropdown
        if (e.target.tagName !== 'INPUT') {
          setIsOpen(!isOpen);
        }
      }}>
        <input
          type="text"
          className="scale-select-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={() => setIsOpen(true)}
        />
        <span className="mini-select-arrow">▾</span>
      </div>
      {isOpen && (
        <div className="mini-select-dropdown">
          {options.map((opt) => (
            <div
              key={opt.value}
              className={`mini-select-option ${opt.value === value ? 'active' : ''}`}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const MapInfoWidget = ({ view }) => {
  const { t, lang } = useLanguage();
  const [rawPoint, setRawPoint] = useState(null);
  const [scale, setScale] = useState(0);
  const [scaleBar, setScaleBar] = useState({ value: 0, unitKey: 'unitKm' });
  const [coordFormat, setCoordFormat] = useState(COORD_FORMATS.WEBMERCATOR);
  const [isProjLoaded, setIsProjLoaded] = useState(false);
  const lastUpdate = useRef(0);

  // Load projection engine for DLTM support
  useEffect(() => {
    const loadProjection = async () => {
      if (!projection.isLoaded()) {
        try {
          await projection.load();
        } catch (e) {
          console.error("Failed to load projection engine", e);
        }
      }
      setIsProjLoaded(true);
    };
    loadProjection();
  }, []);

  useEffect(() => {
    if (!view) return;

    let pointerHandle = null;
    let scaleHandle   = null;

    const initListeners = async () => {
      await view.when();

      pointerHandle = view.on('pointer-move', (event) => {
        const now = Date.now();
        if (now - lastUpdate.current < 50) return; // 20 fps throttle
        lastUpdate.current = now;
        const point = view.toMap({ x: event.x, y: event.y });
        if (point) {
          setRawPoint(point);
        }
      });

      scaleHandle = view.watch('scale', (newScale) => {
        setScale(Math.round(newScale));
        computeScaleBar(newScale, view.resolution);
      });

      setScale(Math.round(view.scale));
      computeScaleBar(view.scale, view.resolution);
    };

    const computeScaleBar = (currentScale, resolution) => {
      if (!resolution) return;
      const metersIn100Px = resolution * 100;

      if (metersIn100Px >= 1000) {
        const km = metersIn100Px / 1000;
        let niceKm = 1;
        if      (km >= 100) niceKm = Math.round(km / 50) * 50;
        else if (km >= 10)  niceKm = Math.round(km / 10) * 10;
        else if (km >= 5)   niceKm = 5;
        else if (km >= 2)   niceKm = 2;
        else                niceKm = 1;
        setScaleBar({ value: niceKm, unitKey: 'unitKm' });
      } else {
        const meters = Math.round(metersIn100Px / 10) * 10;
        setScaleBar({ value: meters, unitKey: 'unitM' });
      }
    };

    initListeners();
    return () => {
      if (pointerHandle) pointerHandle.remove();
      if (scaleHandle)   scaleHandle.remove();
    };
  }, [view]);

  const handleScaleChange = (newScale) => {
    if (view) {
      view.scale = newScale;
    }
  };

  const getFormattedCoords = () => {
    if (!rawPoint) {
      return {
        display: `X: 0.000  Y: 0.000`
      };
    }

    const lat = rawPoint.latitude;
    const lng = rawPoint.longitude;

    switch (coordFormat) {
      case COORD_FORMATS.WGS84_DD:
        if (lat !== undefined && lng !== undefined) {
          return {
            display: `Lon: ${lng.toFixed(6)}°  Lat: ${lat.toFixed(6)}°`
          };
        }
        return { display: `Lon: N/A  Lat: N/A` };
      case COORD_FORMATS.WGS84_DMS:
        if (lat !== undefined && lng !== undefined) {
          return {
            display: `${toDMS(lng, false)}  ${toDMS(lat, true)}`
          };
        }
        return { display: `Lon: N/A  Lat: N/A` };

      case COORD_FORMATS.DLTM:
        if (isProjLoaded) {
          try {
            const dltmPoint = projection.project(rawPoint, new SpatialReference({ wkid: 3997 }));
            if (dltmPoint) {
              return {
                display: `E: ${Math.round(dltmPoint.x)}  N: ${Math.round(dltmPoint.y)}`
              };
            }
          } catch (e) {
            console.error("DLTM projection error", e);
          }
        }
        return { display: `E: N/A  N: N/A` };
      case COORD_FORMATS.AIN_EL_ABD:
        if (isProjLoaded) {
          try {
            const ainPoint = projection.project(rawPoint, new SpatialReference({ wkid: 20439 }));
            if (ainPoint) {
              return {
                display: `X: ${Math.round(ainPoint.x)}  Y: ${Math.round(ainPoint.y)}`
              };
            }
          } catch (e) {
            console.error("Ain el Abd projection error", e);
          }
        }
        return { display: `X: N/A  Y: N/A` };
      case COORD_FORMATS.WEBMERCATOR:
      default:
        return {
          display: `X: ${Math.round(rawPoint.x)}  Y: ${Math.round(rawPoint.y)}`
        };
    }
  };

  const coordOptions = [
    { value: COORD_FORMATS.WEBMERCATOR, label: 'Map Spatial Reference (meters)' },
    { value: COORD_FORMATS.WGS84_DD, label: 'WGS 84 (Decimal Degrees)' },
    { value: COORD_FORMATS.WGS84_DMS, label: 'WGS 84 (DMS)' },
    { value: COORD_FORMATS.DLTM, label: 'Dubai Transverse Mercator (DLTM)' },
    { value: COORD_FORMATS.AIN_EL_ABD, label: 'Ain el Abd / UTM zone 39N - EPSG:20439' }
  ];

  const scaleOptions = STANDARD_SCALES.map(s => ({
    value: s,
    label: `1:${s.toLocaleString('en-US')}`
  }));

  const formattedCoords = getFormattedCoords();

  return (
    <div className="map-info-widget">
      {/* Row 1: Coordinates Selector */}
      <div className="info-row-item coords-row">
        <span className="info-item-label">{t('coordinates') || 'Coords'}:</span>
        <MiniSelect
          options={coordOptions}
          value={coordFormat}
          displayValue={formattedCoords.display}
          onChange={setCoordFormat}
        />
      </div>

      {/* Row 2: Scale Selector & Scale Bar */}
      <div className="info-row-item scale-row">
        <div className="info-item">
          <span className="info-item-label">{t('scale') || 'Scale'}:</span>
          <ScaleSelect
            options={scaleOptions}
            value={scale}
            onChange={handleScaleChange}
          />
        </div>
        <div className="info-item scale-bar-item">
          <div className="scale-bar-segment">
            <div className="scale-bar-label-inner" style={{ display: 'flex', alignItems: 'center', gap: '4px', direction: 'ltr' }}>
              <span dir="ltr">{scaleBar.value}</span>
              <span dir={lang === 'AR' ? 'rtl' : 'ltr'}>{t(scaleBar.unitKey)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapInfoWidget;
