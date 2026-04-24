import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import './MapInfoWidget.css';

const MapInfoWidget = ({ view }) => {
  const { t } = useLanguage();
  const [coords, setCoords]         = useState({ x: '0.000', y: '0.000' });
  const [scale, setScale]           = useState(0);
  const [scaleBarLabel, setScaleBarLabel] = useState('0 km');
  const lastUpdate = useRef(0);

  useEffect(() => {
    if (!view) return;

    let pointerHandle = null;
    let scaleHandle   = null;

    const initListeners = async () => {
      await view.when();

      // ✅ Raw coordinate numbers — NEVER translated
      pointerHandle = view.on('pointer-move', (event) => {
        const now = Date.now();
        if (now - lastUpdate.current < 50) return;
        lastUpdate.current = now;
        const point = view.toMap({ x: event.x, y: event.y });
        if (point) {
          setCoords({ x: point.x.toFixed(3), y: point.y.toFixed(3) });
        }
      });

      // ✅ Raw scale number — NEVER translated
      scaleHandle = view.watch('scale', (newScale) => {
        setScale(Math.round(newScale));
        updateScaleBar(newScale, view.resolution);
      });

      setScale(Math.round(view.scale));
      updateScaleBar(view.scale, view.resolution);
    };

    const updateScaleBar = (currentScale, resolution) => {
      if (!resolution) return;
      const metersIn100Px = resolution * 100;
      let label = '';
      if (metersIn100Px >= 1000) {
        const km = metersIn100Px / 1000;
        let niceKm = 1;
        if (km >= 100)     niceKm = Math.round(km / 50) * 50;
        else if (km >= 10) niceKm = Math.round(km / 10) * 10;
        else if (km >= 5)  niceKm = 5;
        else if (km >= 2)  niceKm = 2;
        else               niceKm = 1;
        label = `${niceKm} km`;
      } else {
        const meters = Math.round(metersIn100Px / 10) * 10;
        label = `${meters} m`;
      }
      // ✅ Scale bar unit (km/m) — kept as universal metric notation, not translated
      setScaleBarLabel(label);
    };

    initListeners();
    return () => {
      if (pointerHandle) pointerHandle.remove();
      if (scaleHandle)   scaleHandle.remove();
    };
  }, [view]);

  return (
    <div className="map-info-widget">
      <div className="info-row">
        {/* ✅ "X:" / ":X" label — translated. Coordinate values — raw numbers, NOT translated */}
        <span className="info-label">{t('coordX')}</span>
        <span className="info-value">{coords.x}</span>
        <span className="info-label ml-12">{t('coordY')}</span>
        <span className="info-value">{coords.y}</span>
      </div>

      <div className="info-row scale-row">
        {/* ✅ "Scale 1:" label — translated. Scale number — raw, NOT translated */}
        <span className="info-label">{t('scale')}</span>
        <span className="info-value">{scale.toLocaleString()}</span>
      </div>

      <div className="scale-bar-wrapper">
        <div className="scale-bar-segment">
          {/* ✅ km/m unit kept as-is — universal notation */}
          <div className="scale-bar-label-inner">{scaleBarLabel}</div>
        </div>
      </div>
    </div>
  );
};

export default MapInfoWidget;
