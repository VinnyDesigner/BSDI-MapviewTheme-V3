import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, RotateCcw, Info, Zap, Clock, Columns2 } from 'lucide-react';
import CustomSelect from './CustomSelect';
import './TemporalFilterPanel.css';

const SPEED_MAP = { Slow: 2000, Medium: 1200, Fast: 600 };

const TemporalFilterPanel = ({ 
  layersConfig, 
  timelapseSettings, 
  setTimelapseSettings,
  timeCompareTab = 'slider',
  setTimeCompareTab
}) => {
  const [availableFields, setAvailableFields] = useState([]);
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  const [fieldError, setFieldError] = useState(null);
  const intervalRef = useRef(null);

  // Filter layers that have time properties
  const temporalLayers = layersConfig.filter(l => l.timeEnabled || l.startYear || l.timeField);
  const activeLayer = temporalLayers.find(l => l.id === timelapseSettings.layerId);

  // ─── Helper: push a filter to the map immediately ────────────────────────
  const pushFilter = useCallback((overrides = {}) => {
    setTimelapseSettings(prev => ({
      ...prev,
      ...overrides,
      lastApply: Date.now()
    }));
  }, [setTimelapseSettings]);

  // ─── Real field detection from service metadata ────────────────────────
  useEffect(() => {
    if (!activeLayer) return;
    setFieldError(null);
    setIsLoadingFields(true);

    const getProxyUrl = (url) => {
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return url.replace('https://gis9.smartgeoapps.com', '/arcgis-proxy');
      }
      return url;
    };

    const detectFields = async () => {
      try {
        // For MapImageLayer, query /0 sublayer (first sublayer fields)
        const serviceUrl = activeLayer.url;
        const subLayerUrl = `${getProxyUrl(serviceUrl)}/0?f=pjson`;
        const res = await fetch(subLayerUrl);
        const data = await res.json();

        if (data.fields && data.fields.length > 0) {
          // Filter to numeric/date fields which are useful for temporal filtering
          const numericTypes = ['esriFieldTypeSmallInteger', 'esriFieldTypeInteger',
            'esriFieldTypeSingle', 'esriFieldTypeDouble', 'esriFieldTypeDate'];
          const timeFields = data.fields
            .filter(f => numericTypes.includes(f.type))
            .map(f => ({ name: f.name, alias: f.alias || f.name, type: f.type }));

          setAvailableFields(timeFields.length > 0 ? timeFields : [
            { name: activeLayer.timeField || 'SURVEY_YEAR', alias: activeLayer.timeField || 'Survey Year' }
          ]);

          // Auto-select the configured timeField
          const configField = activeLayer.timeField;
          const matchedField = timeFields.find(f => f.name === configField);
          if (matchedField && !timelapseSettings.timeField) {
            setTimelapseSettings(prev => ({ ...prev, timeField: matchedField.name }));
          } else if (!timelapseSettings.timeField && timeFields.length > 0) {
            setTimelapseSettings(prev => ({ ...prev, timeField: timeFields[0].name }));
          }
        } else {
          // Fallback to config
          const fallback = [{ name: activeLayer.timeField || 'SURVEY_YEAR', alias: activeLayer.timeField || 'Survey Year' }];
          setAvailableFields(fallback);
          if (!timelapseSettings.timeField) {
            setTimelapseSettings(prev => ({ ...prev, timeField: fallback[0].name }));
          }
        }
      } catch (err) {
        console.warn('[TemporalFilter] Field detection failed, using config fallback:', err.message);
        setFieldError('Using configured field (service unreachable)');
        const fallback = [{ name: activeLayer.timeField || 'SURVEY_YEAR', alias: activeLayer.timeField || 'Survey Year' }];
        setAvailableFields(fallback);
        if (!timelapseSettings.timeField) {
          setTimelapseSettings(prev => ({ ...prev, timeField: fallback[0].name }));
        }
      } finally {
        setIsLoadingFields(false);
      }
    };

    detectFields();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLayer?.id]);

  // ─── Playback Engine ───────────────────────────────────────────────────
  const stopPlayback = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setTimelapseSettings(prev => ({ ...prev, isPlaying: false }));
  }, [setTimelapseSettings]);

  const startPlayback = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const speed = SPEED_MAP[timelapseSettings.speed] || 1200;
    intervalRef.current = setInterval(() => {
      setTimelapseSettings(prev => {
        // Each step advances toYear and triggers a real map filter
        const nextYear = prev.toYear + 1;
        const loopedYear = nextYear > prev.endYear ? prev.startYear : nextYear;
        return {
          ...prev,
          toYear: loopedYear,
          lastApply: Date.now() // ← key: triggers map filter on every frame
        };
      });
    }, speed);
  }, [timelapseSettings.speed, setTimelapseSettings]);

  useEffect(() => {
    if (timelapseSettings.isPlaying) {
      startPlayback();
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelapseSettings.isPlaying, timelapseSettings.speed]);

  // ─── Controls ──────────────────────────────────────────────────────────
  const togglePlay = () => {
    if (timelapseSettings.isPlaying) {
      stopPlayback();
    } else {
      setTimelapseSettings(prev => ({ ...prev, isPlaying: true }));
    }
  };

  const stepForward = () => {
    stopPlayback();
    const next = Math.min(timelapseSettings.endYear, timelapseSettings.toYear + 1);
    pushFilter({ toYear: next, isPlaying: false });
  };

  const stepBack = () => {
    stopPlayback();
    const prev = Math.max(timelapseSettings.startYear, timelapseSettings.toYear - 1);
    pushFilter({ toYear: prev, isPlaying: false });
  };

  const handleReset = () => {
    stopPlayback();
    if (!activeLayer) return;
    setTimelapseSettings(prev => ({
      ...prev,
      fromYear: activeLayer.startYear || prev.startYear,
      toYear: activeLayer.endYear || prev.endYear,
      isPlaying: false,
      lastApply: 0 // signal to clear filter
    }));
  };

  const handleApply = () => {
    stopPlayback();
    pushFilter({});
  };

  // ─── Derived display values ────────────────────────────────────────────
  const totalYears = timelapseSettings.endYear - timelapseSettings.startYear || 1;
  const fromPct = ((timelapseSettings.fromYear - timelapseSettings.startYear) / totalYears) * 100;
  const toPct   = ((timelapseSettings.toYear   - timelapseSettings.startYear) / totalYears) * 100;

  return (
    <div className="temporal-filter-container">
      {/* 0. TAB SWITCHER */}
      <div className="temporal-tab-container">
        <button 
          className={`temporal-tab-btn ${timeCompareTab === 'slider' ? 'active' : ''}`}
          onClick={() => {
            stopPlayback();
            setTimeCompareTab('slider');
          }}
        >
          <Clock size={14} />
          <span>Timeline Filter</span>
        </button>
        <button 
          className={`temporal-tab-btn ${timeCompareTab === 'swipe' ? 'active' : ''}`}
          onClick={() => {
            stopPlayback();
            setTimeCompareTab('swipe');
          }}
        >
          <Columns2 size={14} />
          <span>Swipe Compare</span>
        </button>
      </div>

      <div className="temporal-filter-body">

        {/* 1. STATUS BADGE */}
        {timelapseSettings.lastApply > 0 && (
          <div className="temporal-active-badge">
            <Zap size={13} />
            <span>
              {timeCompareTab === 'swipe'
                ? `Compare: ${timelapseSettings.fromYear} | ${timelapseSettings.toYear}`
                : `Filter Active: ${timelapseSettings.fromYear} — ${timelapseSettings.toYear}`}
            </span>
          </div>
        )}

        {/* 2. SELECT TEMPORAL LAYER */}
        <div className="temporal-section">
          <label className="temporal-label">Temporal Layer</label>
          <CustomSelect 
            options={temporalLayers.map(l => ({ id: l.id, title: l.title }))}
            value={timelapseSettings.layerId}
            onChange={(val) => {
              const layer = temporalLayers.find(l => l.id === val);
              if (!layer) return;
              stopPlayback();
              setTimelapseSettings({
                ...timelapseSettings,
                layerId: val,
                startYear: layer.startYear || 2018,
                endYear: layer.endYear || 2024,
                fromYear: layer.startYear || 2018,
                toYear: layer.endYear || 2024,
                timeField: layer.timeField || '',
                isPlaying: false,
                lastApply: 0
              });
            }}
            placeholder="Choose a layer..."
          />
        </div>

        {/* 3. TIME FIELD */}
        <div className="temporal-section">
          <label className="temporal-label">
            Time Field
            {isLoadingFields && <span className="field-loading-dot" />}
          </label>
          <CustomSelect 
            options={availableFields.map(f => ({ id: f.name, title: f.alias || f.name }))}
            value={timelapseSettings.timeField}
            onChange={(val) => setTimelapseSettings(prev => ({ ...prev, timeField: val }))}
            placeholder={isLoadingFields ? 'Detecting fields...' : 'Select time field...'}
          />
          {fieldError && <span className="field-error-hint">{fieldError}</span>}
        </div>

        {/* 4. TIME ADJUSTERS */}
        {timeCompareTab === 'swipe' ? (
          <div className="temporal-section timeline-range-section">
            <label className="temporal-label" style={{ marginBottom: '12px' }}>Comparison Years</label>
            
            {/* Left Year Slider */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px', fontWeight: '600' }}>
                <span style={{ color: '#64748b' }}>Left Side Year</span>
                <span style={{ color: '#1e3c72', fontWeight: 'bold' }}>{timelapseSettings.fromYear}</span>
              </div>
              <input 
                type="range"
                className="range-thumb single-slider"
                min={timelapseSettings.startYear}
                max={timelapseSettings.endYear}
                value={timelapseSettings.fromYear}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setTimelapseSettings(prev => ({ ...prev, fromYear: val }));
                }}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>

            {/* Right Year Slider */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px', fontWeight: '600' }}>
                <span style={{ color: '#64748b' }}>Right Side Year</span>
                <span style={{ color: '#1e3c72', fontWeight: 'bold' }}>{timelapseSettings.toYear}</span>
              </div>
              <input 
                type="range"
                className="range-thumb single-slider"
                min={timelapseSettings.startYear}
                max={timelapseSettings.endYear}
                value={timelapseSettings.toYear}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setTimelapseSettings(prev => ({ ...prev, toYear: val }));
                }}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>
          </div>
        ) : (
          <div className="temporal-section timeline-range-section">
            <div className="timeline-header">
              <label className="temporal-label">Time Range</label>
              <div className="range-display">
                <Clock size={13} />
                <span>{timelapseSettings.fromYear} — {timelapseSettings.toYear}</span>
              </div>
            </div>

            <div className="timeline-slider-wrapper">
              <div className="timeline-track">
                <div 
                  className="timeline-highlight"
                  style={{ left: `${fromPct}%`, right: `${100 - toPct}%` }}
                />
                {/* FROM handle */}
                <input 
                  type="range"
                  className="range-thumb thumb-left"
                  min={timelapseSettings.startYear}
                  max={timelapseSettings.endYear}
                  value={timelapseSettings.fromYear}
                  onChange={(e) => {
                    const val = Math.min(Number(e.target.value), timelapseSettings.toYear);
                    setTimelapseSettings(prev => ({ ...prev, fromYear: val }));
                  }}
                />
                {/* TO handle */}
                <input 
                  type="range"
                  className="range-thumb thumb-right"
                  min={timelapseSettings.startYear}
                  max={timelapseSettings.endYear}
                  value={timelapseSettings.toYear}
                  onChange={(e) => {
                    const val = Math.max(Number(e.target.value), timelapseSettings.fromYear);
                    setTimelapseSettings(prev => ({ ...prev, toYear: val }));
                  }}
                />
              </div>
              <div className="timeline-labels">
                <span>{timelapseSettings.startYear}</span>
                <span>{timelapseSettings.endYear}</span>
              </div>
            </div>
          </div>
        )}

        {/* 5. PLAYBACK SPEED (Timeline Only) */}
        {timeCompareTab === 'slider' && (
          <div className="temporal-section">
            <label className="temporal-label">Playback Speed</label>
            <div className="speed-btn-group">
              {['Slow', 'Medium', 'Fast'].map(s => (
                <button
                  key={s}
                  className={`speed-btn ${(timelapseSettings.speed || 'Medium') === s ? 'active' : ''}`}
                  onClick={() => setTimelapseSettings(prev => ({ ...prev, speed: s }))}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 6. PLAYBACK CONTROLS (Timeline Only) */}
        {timeCompareTab === 'slider' && (
          <div className="temporal-section playback-controls-section">
            <div className="playback-group">
              <button className="playback-btn secondary" onClick={stepBack} title="Step Back (-1yr)">
                <ChevronLeft size={20} />
              </button>
              <button
                className={`playback-btn primary ${timelapseSettings.isPlaying ? 'active' : ''}`}
                onClick={togglePlay}
                disabled={!timelapseSettings.layerId}
              >
                {timelapseSettings.isPlaying
                  ? <Pause size={22} fill="currentColor" />
                  : <Play size={22} fill="currentColor" />}
              </button>
              <button className="playback-btn secondary" onClick={stepForward} title="Step Forward (+1yr)">
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}

        <div className="info-box-v4">
          <Info size={14} />
          <span>
            {timeCompareTab === 'swipe'
              ? 'Creates a swipe divider comparing left year vs right year of the selected layer.'
              : 'Applies definitionExpression to filter features by year. Use playback to animate.'}
          </span>
        </div>

      </div>

      <div className="temporal-footer">
        <button className="temporal-btn-secondary" onClick={handleReset}>
          <RotateCcw size={15} /> Reset
        </button>
        <button
          className="temporal-btn-primary"
          onClick={handleApply}
          disabled={!timelapseSettings.layerId || !timelapseSettings.timeField}
        >
          {timeCompareTab === 'swipe' ? 'Apply Compare' : 'Apply Filter'}
        </button>
      </div>
    </div>
  );
};

export default TemporalFilterPanel;
