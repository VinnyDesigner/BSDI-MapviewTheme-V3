import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import './MapInfoWidget.css';

const MapInfoWidget = ({ view }) => {
  const { t, lang } = useLanguage();

  // ✅ Coordinate numbers stored as raw strings — never translated
  const [coords, setCoords] = useState({ x: '0.000', y: '0.000' });

  // ✅ Scale number stored raw — never translated
  const [scale, setScale] = useState(0);

  // ✅ Scale bar split into numeric value + unit key.
  //    unitKey ('unitKm' | 'unitM') is resolved via t() at render time,
  //    so the same number is displayed in both languages with a translated suffix.
  const [scaleBar, setScaleBar] = useState({ value: 0, unitKey: 'unitKm' });

  const lastUpdate = useRef(0);

  useEffect(() => {
    if (!view) return;

    let pointerHandle = null;
    let scaleHandle   = null;

    const initListeners = async () => {
      await view.when();

      // Pointer-move: update raw coordinate numbers only
      pointerHandle = view.on('pointer-move', (event) => {
        const now = Date.now();
        if (now - lastUpdate.current < 50) return; // 20 fps throttle
        lastUpdate.current = now;
        const point = view.toMap({ x: event.x, y: event.y });
        if (point) {
          setCoords({ x: point.x.toFixed(3), y: point.y.toFixed(3) });
        }
      });

      // Scale watcher: store numeric scale + update scale bar
      scaleHandle = view.watch('scale', (newScale) => {
        setScale(Math.round(newScale));
        computeScaleBar(newScale, view.resolution);
      });

      // Initial values
      setScale(Math.round(view.scale));
      computeScaleBar(view.scale, view.resolution);
    };

    /**
     * Computes a "nice" scale bar length and stores it as { value, unitKey }.
     * The numeric value is NEVER translated.
     * unitKey ('unitKm' or 'unitM') is resolved by t() at render time.
     */
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
        // ✅ Number stored raw; unit stored as a translation key
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

  return (
    <div className="map-info-widget">

      {/* Coordinates row */}
      <div className="info-row">
        <span className="info-label" dir="ltr">{t('coordX')}</span>
        <span className="info-value" dir="ltr">{coords.x}</span>
        <span className="info-label ml-12" dir="ltr">{t('coordY')}</span>
        <span className="info-value" dir="ltr">{coords.y}</span>
      </div>

      {/* Scale row */}
      <div className="info-row scale-row">
        <span className="info-label" dir={lang === 'AR' ? 'rtl' : 'ltr'}>{t('scale')}</span>
        <span className="info-value" dir="ltr">{scale.toLocaleString('en-US')}</span>
      </div>

      {/* Scale bar */}
      <div className="scale-bar-wrapper">
        <div className="scale-bar-segment">
          <div className="scale-bar-label-inner" style={{ display: 'flex', alignItems: 'center', gap: '4px', direction: 'ltr' }}>
            <span dir="ltr">{scaleBar.value}</span>
            <span dir={lang === 'AR' ? 'rtl' : 'ltr'}>{t(scaleBar.unitKey)}</span>
          </div>
        </div>
      </div>

    </div>
  );
};

export default MapInfoWidget;
