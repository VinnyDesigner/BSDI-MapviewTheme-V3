import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, RotateCcw, Info, Zap, Clock, Columns2, Square } from 'lucide-react';
import CustomSelect from './CustomSelect';
import './TemporalFilterPanel.css';

const SPEED_MAP = { Slow: 2000, Medium: 1200, Fast: 600 };

const getProxyUrl = (url) => {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    if (url.includes('https://gis9.smartgeoapps.com')) {
      return url.replace('https://gis9.smartgeoapps.com', '/arcgis-proxy');
    }

  }
  return url;
};

const formatGeometryType = (type) => {
  if (!type) return 'Unknown';
  const t = type.toLowerCase();
  if (t.includes('polygon')) return 'Polygon';
  if (t.includes('polyline') || t.includes('line')) return 'Polyline';
  if (t.includes('point')) return 'Point';
  if (t.includes('multipoint')) return 'Multipoint';
  if (t.includes('multipatch') || t.includes('mesh')) return 'Multipatch';
  return type.charAt(0).toUpperCase() + type.slice(1);
};

const calculateStepSize = (min, max, type) => {
  if (type === 'numeric') return 1;
  const rangeMs = max - min;
  const oneDay = 24 * 60 * 60 * 1000;
  const oneMonth = 30 * oneDay;
  const oneYear = 365.25 * oneDay;
  
  if (rangeMs <= oneMonth) return oneDay;
  if (rangeMs <= 2 * oneYear) return oneMonth;
  return oneYear; // Default yearly steps
};

const formatPlayValue = (val, type) => {
  if (val === null || val === undefined) return '';
  if (type === 'numeric') return val.toString();
  
  const date = new Date(val);
  if (isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
};

// Helper: Traverse map layers recursively to get feature-compatible layers
const getAllFeatureLayers = (map) => {
  if (!map) return [];
  const result = [];
  
  function collect(layer) {
    if (layer.type === "group") {
      layer.layers.forEach(l => collect(l));
    } else if (layer.type === "map-image") {
      if (layer.allSublayers) {
        layer.allSublayers.forEach(sub => {
          const isGroup = sub.sublayers && sub.sublayers.length > 0;
          if (!isGroup) {
            result.push({
              id: `${layer.id}_sub_${sub.id}`,
              title: `${layer.title} - ${sub.title || sub.name}`,
              type: "map-image-sublayer",
              geometryType: sub.geometryType || "Unknown",
              rawLayer: sub,
              parentLayer: layer
            });
          }
        });
      }
    } else if (
      layer.type === "feature" ||
      layer.type === "geojson" ||
      layer.type === "csv"
    ) {
      result.push({
        id: layer.id,
        title: layer.title,
        type: layer.type,
        geometryType: layer.geometryType || "Unknown",
        rawLayer: layer,
        parentLayer: layer
      });
    }
  }
  
  map.layers.forEach(l => collect(l));
  return result;
};

// Helper: Get fields for a layer
const getLayerFields = async (selectedLayerItem) => {
  if (!selectedLayerItem) return [];
  const { type, rawLayer } = selectedLayerItem;
  
  if (type === "map-image-sublayer") {
    try {
      const parentUrl = selectedLayerItem.parentLayer.url;
      const sublayerId = selectedLayerItem.sublayerId;
      const proxyUrl = getProxyUrl(`${parentUrl}/${sublayerId}?f=pjson`);
      
      const res = await fetch(proxyUrl);
      const data = await res.json();
      if (data && data.fields) {
        return data.fields;
      }
    } catch (e) {
      console.error("Failed to fetch sublayer fields:", e);
    }
    return [];
  } else {
    if (rawLayer.fields) {
      return rawLayer.fields;
    } else {
      if (!rawLayer.loaded) {
        await rawLayer.load();
      }
      return rawLayer.fields || [];
    }
  }
};

// Helper: Detect field type (supports both REST API and JS API type names)
const detectTimeType = (fieldObj) => {
  if (!fieldObj) return 'numeric';
  const type = (fieldObj.type || '').toLowerCase();
  if (type === 'esrifieldtypedate' || type === 'date' || type === 'date-only' || type === 'timestamp-offset') return 'date';
  if (type === 'esrifieldtypestring' || type === 'string') return 'string-date';
  return 'numeric';
};

// Helper: Query MIN/MAX statistics for a field
const getTimeRange = async (layerItem, fieldName) => {
  const { type, rawLayer } = layerItem;
  
  const minStat = {
    onStatisticField: fieldName,
    outStatisticFieldName: "min_val",
    statisticType: "min"
  };
  const maxStat = {
    onStatisticField: fieldName,
    outStatisticFieldName: "max_val",
    statisticType: "max"
  };
  
  let queryUrl = "";
  if (type === "map-image-sublayer") {
    const parentUrl = layerItem.parentLayer.url;
    const sublayerId = layerItem.sublayerId;
    queryUrl = `${parentUrl}/${sublayerId}/query`;
  }
  
  try {
    if (queryUrl) {
      const params = new URLSearchParams();
      params.append("f", "json");
      params.append("where", "1=1");
      params.append("outStatistics", JSON.stringify([minStat, maxStat]));
      
      const proxyUrl = getProxyUrl(queryUrl);
      const res = await fetch(proxyUrl, {
        method: "POST",
        body: params
      });
      const data = await res.json();
      if (data && data.features && data.features.length > 0) {
        const attrs = data.features[0].attributes;
        const minVal = attrs.min_val !== undefined ? attrs.min_val : (attrs.MIN_VAL !== undefined ? attrs.MIN_VAL : attrs.Min_Val);
        const maxVal = attrs.max_val !== undefined ? attrs.max_val : (attrs.MAX_VAL !== undefined ? attrs.MAX_VAL : attrs.Max_Val);
        if (minVal !== null && minVal !== undefined && maxVal !== null && maxVal !== undefined) {
          return { min: minVal, max: maxVal };
        }
      }
    } else {
      const query = rawLayer.createQuery();
      query.where = "1=1";
      query.outStatistics = [minStat, maxStat];
      
      const featureSet = await rawLayer.queryFeatures(query);
      if (featureSet && featureSet.features && featureSet.features.length > 0) {
        const attrs = featureSet.features[0].attributes;
        const minVal = attrs.min_val !== undefined ? attrs.min_val : (attrs.MIN_VAL !== undefined ? attrs.MIN_VAL : attrs.Min_Val);
        const maxVal = attrs.max_val !== undefined ? attrs.max_val : (attrs.MAX_VAL !== undefined ? attrs.MAX_VAL : attrs.Max_Val);
        if (minVal !== null && minVal !== undefined && maxVal !== null && maxVal !== undefined) {
          return { min: minVal, max: maxVal };
        }
      }
    }
  } catch (e) {
    console.warn("Statistics query failed, falling back to memory scan:", e.message);
  }

  // Fallback: memory scan query
  try {
    let features = [];
    if (type === "map-image-sublayer") {
      const params = new URLSearchParams();
      params.append("f", "json");
      params.append("where", "1=1");
      params.append("outFields", fieldName);
      params.append("returnGeometry", "false");
      
      const proxyUrl = getProxyUrl(queryUrl);
      const res = await fetch(proxyUrl, { method: "POST", body: params });
      const data = await res.json();
      features = data.features || [];
    } else {
      const query = rawLayer.createQuery();
      query.where = "1=1";
      query.outFields = [fieldName];
      query.returnGeometry = false;
      const featureSet = await rawLayer.queryFeatures(query);
      features = featureSet.features || [];
    }
    
    if (features.length > 0) {
      const vals = features
        .map(f => f.attributes[fieldName])
        .filter(v => v !== null && v !== undefined);
      if (vals.length > 0) {
        let min = vals[0];
        let max = vals[0];
        vals.forEach(v => {
          if (v < min) min = v;
          if (v > max) max = v;
        });
        return { min, max };
      }
    }
  } catch (err) {
    console.error("Memory fallback statistics query failed:", err);
  }
  
  return null;
};

// Helper: Query filtered count
const getActiveFeatureCount = async (layerItem, fieldName, filterExpr) => {
  if (!layerItem) return 0;
  const { type, rawLayer } = layerItem;
  let queryUrl = "";
  if (type === "map-image-sublayer") {
    const parentUrl = layerItem.parentLayer.url;
    const sublayerId = layerItem.sublayerId;
    queryUrl = `${parentUrl}/${sublayerId}/query`;
  }
  
  try {
    if (queryUrl) {
      const params = new URLSearchParams();
      params.append("f", "json");
      params.append("where", filterExpr || "1=1");
      params.append("returnCountOnly", "true");
      
      const proxyUrl = getProxyUrl(queryUrl);
      const res = await fetch(proxyUrl, { method: "POST", body: params });
      const data = await res.json();
      return data.count !== undefined ? data.count : 0;
    } else {
      const query = rawLayer.createQuery();
      query.where = filterExpr || "1=1";
      const count = await rawLayer.queryFeatureCount(query);
      return count;
    }
  } catch (e) {
    console.error("Failed to query active count:", e);
    return 0;
  }
};

// --- Desktop Dynamic Time Lapse Component ---
const DesktopTimeLapsePanel = ({ 
  mapView,
  timelapseSettings,
  setTimelapseSettings
}) => {
  const [layersList, setLayersList] = useState([]);
  const [selectedLayerId, setSelectedLayerId] = useState('');
  const [fieldsList, setFieldsList] = useState([]);
  const [selectedFieldName, setSelectedFieldName] = useState('');
  const [timeType, setTimeType] = useState('numeric');
  
  const [minTime, setMinTime] = useState(null);
  const [maxTime, setMaxTime] = useState(null);
  const [currentPlayVal, setCurrentPlayVal] = useState(null);
  const [cachedRanges, setCachedRanges] = useState({});
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState('Medium');
  const [loopMode, setLoopMode] = useState(true);
  
  const [activeCount, setActiveCount] = useState(0);
  const [isLoadingCount, setIsLoadingCount] = useState(false);
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  const [isLoadingRange, setIsLoadingRange] = useState(false);
  
  const intervalRef = useRef(null);

  const selectedLayerItem = layersList.find(l => l.id === selectedLayerId);
  const selectedFieldItem = fieldsList.find(f => f.name === selectedFieldName);

  // Sync with App settings initially if layerId is already set
  useEffect(() => {
    if (timelapseSettings?.layerId && layersList.length > 0) {
      setSelectedLayerId(timelapseSettings.layerId);
      if (timelapseSettings.timeField) {
        setSelectedFieldName(timelapseSettings.timeField);
      }
    }
  }, [timelapseSettings?.layerId, layersList]);

  // Detect and update active map layers
  useEffect(() => {
    if (!mapView || !mapView.map) return;
    
    const updateLayersList = () => {
      const list = getAllFeatureLayers(mapView.map);
      setLayersList(list);
    };

    updateLayersList();

    const handle = mapView.map.layers.on("change", updateLayersList);
    
    mapView.map.layers.forEach(l => {
      if (!l.loaded) {
        l.load().then(updateLayersList).catch(() => {});
      }
    });

    return () => handle.remove();
  }, [mapView]);

  // Load fields when selected layer changes
  useEffect(() => {
    if (!selectedLayerItem) {
      setFieldsList([]);
      setSelectedFieldName('');
      setMinTime(null);
      setMaxTime(null);
      setCurrentPlayVal(null);
      setActiveCount(0);
      return;
    }

    const loadFields = async () => {
      setIsLoadingFields(true);
      try {
        const fields = await getLayerFields(selectedLayerItem);
        // Support both REST API types (esriFieldType*) and JS API types (date, string, integer, etc.)
        const validTypesRest = [
          'esriFieldTypeSmallInteger', 
          'esriFieldTypeInteger',
          'esriFieldTypeSingle', 
          'esriFieldTypeDouble', 
          'esriFieldTypeDate', 
          'esriFieldTypeString'
        ];
        const validTypesJsApi = [
          'small-integer', 'integer', 'long', 'big-integer',
          'single', 'double',
          'date', 'date-only', 'timestamp-offset',
          'string'
        ];
        const isStringType = (type) => {
          const t = (type || '').toLowerCase();
          return t === 'esrifieldtypestring' || t === 'string';
        };
        const isValidType = (type) => {
          if (!type) return false;
          return validTypesRest.includes(type) || validTypesJsApi.includes(type.toLowerCase());
        };
        const filtered = fields.filter(f => {
          if (!isValidType(f.type)) return false;
          if (isStringType(f.type)) {
            const name = f.name.toLowerCase();
            return name.includes('year') || name.includes('date') || name.includes('time') || name.includes('yr');
          }
          return true;
        });
        setFieldsList(filtered);
        
        if (filtered.length > 0) {
          const configField = selectedLayerItem.rawLayer.timeField || (selectedLayerItem.parentLayer && selectedLayerItem.parentLayer.timeField);
          const matched = filtered.find(f => f.name === configField);
          setSelectedFieldName(matched ? matched.name : filtered[0].name);
        } else {
          setSelectedFieldName('');
        }
      } catch (e) {
        console.error("Error loading fields:", e);
      } finally {
        setIsLoadingFields(false);
      }
    };

    loadFields();
  }, [selectedLayerId]);

  // Load statistics and detect timeType when selected field changes
  useEffect(() => {
    if (!selectedLayerItem || !selectedFieldName) {
      setMinTime(null);
      setMaxTime(null);
      setCurrentPlayVal(null);
      setActiveCount(0);
      return;
    }

    const loadRange = async () => {
      setIsLoadingRange(true);
      setIsPlaying(false);
      
      const type = detectTimeType(selectedFieldItem);
      setTimeType(type);

      const cacheKey = `${selectedLayerId}_${selectedFieldName}`;
      let range = cachedRanges[cacheKey];
      
      if (!range) {
        range = await getTimeRange(selectedLayerItem, selectedFieldName);
        if (range) {
          setCachedRanges(prev => ({ ...prev, [cacheKey]: range }));
        }
      }

      if (range) {
        let min = range.min;
        let max = range.max;
        
        if (type === 'date' || type === 'string-date') {
          const parsedMin = new Date(min).getTime();
          const parsedMax = new Date(max).getTime();
          if (!isNaN(parsedMin) && !isNaN(parsedMax)) {
            setMinTime(parsedMin);
            setMaxTime(parsedMax);
            setCurrentPlayVal(parsedMin);
          }
        } else {
          setMinTime(Number(min));
          setMaxTime(Number(max));
          setCurrentPlayVal(Number(min));
        }
      } else {
        setMinTime(2018);
        setMaxTime(2024);
        setCurrentPlayVal(2018);
      }
      
      setIsLoadingRange(false);
    };

    loadRange();
  }, [selectedFieldName, selectedLayerId]);

  // Animation Playback Effect
  useEffect(() => {
    if (isPlaying && minTime !== null && maxTime !== null) {
      const intervalDuration = SPEED_MAP[playbackSpeed] || 1200;
      const step = calculateStepSize(minTime, maxTime, timeType);

      intervalRef.current = setInterval(() => {
        setCurrentPlayVal(prev => {
          let next = prev + step;
          if (next > maxTime) {
            if (loopMode) {
              next = minTime;
            } else {
              setIsPlaying(false);
              return prev;
            }
          }
          return next;
        });
      }, intervalDuration);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, playbackSpeed, minTime, maxTime, timeType, loopMode]);

  // Apply map filter and query active count on currentPlayVal change
  useEffect(() => {
    if (!selectedLayerItem || !selectedFieldName || minTime === null || currentPlayVal === null) return;

    // Direct state propagation to App which notifies MapView
    setTimelapseSettings({
      layerId: selectedLayerId,
      timeField: selectedFieldName,
      timeType: timeType,
      fromYear: minTime,
      toYear: currentPlayVal,
      startYear: minTime,
      endYear: maxTime,
      isPlaying: isPlaying,
      speed: playbackSpeed,
      loop: loopMode,
      lastApply: Date.now()
    });

    const debounceTimer = setTimeout(async () => {
      let expression = "";
      if (timeType === 'date' || timeType === 'string-date') {
        const dateStr = new Date(currentPlayVal).toISOString().split('T')[0];
        if (timeType === 'date') {
          expression = `${selectedFieldName} <= DATE '${dateStr}'`;
        } else {
          expression = `${selectedFieldName} <= '${dateStr}'`;
        }
      } else {
        expression = `${selectedFieldName} <= ${currentPlayVal}`;
      }

      setIsLoadingCount(true);
      const count = await getActiveFeatureCount(selectedLayerItem, selectedFieldName, expression);
      setActiveCount(count);
      setIsLoadingCount(false);
    }, 200);

    return () => clearTimeout(debounceTimer);
  }, [currentPlayVal, selectedLayerId, selectedFieldName, timeType, minTime, isPlaying, playbackSpeed, loopMode]);

  const handleReset = async () => {
    setIsPlaying(false);
    setSelectedLayerId('');
    setSelectedFieldName('');
    setMinTime(null);
    setMaxTime(null);
    setCurrentPlayVal(null);
    setActiveCount(0);
    
    setTimelapseSettings({
      layerId: '',
      timeField: '',
      timeType: 'numeric',
      fromYear: 2018,
      toYear: 2024,
      startYear: 2018,
      endYear: 2024,
      isPlaying: false,
      lastApply: 0 // clears filters
    });
  };

  const handleStop = () => {
    setIsPlaying(false);
    if (minTime !== null) {
      setCurrentPlayVal(minTime);
    }
  };

  const stepForward = () => {
    setIsPlaying(false);
    if (currentPlayVal !== null && maxTime !== null) {
      const step = calculateStepSize(minTime, maxTime, timeType);
      setCurrentPlayVal(Math.min(maxTime, currentPlayVal + step));
    }
  };

  const stepBack = () => {
    setIsPlaying(false);
    if (currentPlayVal !== null && minTime !== null) {
      const step = calculateStepSize(minTime, maxTime, timeType);
      setCurrentPlayVal(Math.max(minTime, currentPlayVal - step));
    }
  };

  const progressPercentage = (minTime !== null && maxTime !== null && currentPlayVal !== null)
    ? ((currentPlayVal - minTime) / (maxTime - minTime)) * 100
    : 0;

  return (
    <div className="temporal-filter-container">
      <div className="temporal-desktop-body">
        
        {/* Layer Selection */}
        <div className="temporal-section">
          <label className="temporal-label">Select Layer</label>
          <CustomSelect 
            options={layersList.map(l => ({
              id: l.id,
              title: `${l.title} (${formatGeometryType(l.geometryType)})`
            }))}
            value={selectedLayerId}
            onChange={(val) => {
              setSelectedLayerId(val);
            }}
            placeholder="Select a layer to animate..."
          />
        </div>

        {/* Field Selection */}
        <div className="temporal-section">
          <label className="temporal-label">
            Time Field
            {isLoadingFields && <span className="field-loading-dot" />}
          </label>
          <CustomSelect 
            options={fieldsList.map(f => ({
              id: f.name,
              title: `${f.name} (${f.alias || f.name})`
            }))}
            value={selectedFieldName}
            onChange={(val) => setSelectedFieldName(val)}
            placeholder={isLoadingFields ? 'Loading fields...' : 'Select time field...'}
          />
        </div>

        {/* Timeline Slider — clean single-track GIS style */}
        {minTime !== null && maxTime !== null && currentPlayVal !== null && (
          <div className="temporal-section timeline-range-section">
            <div className="timeline-header">
              <label className="temporal-label">Timeline</label>
              <div className="range-display">
                <Clock size={13} />
                <span>{formatPlayValue(currentPlayVal, timeType)}</span>
              </div>
            </div>

            <div className="timeline-slider-clean">
              <div className="timeline-track-clean">
                <div 
                  className="timeline-fill-clean"
                  style={{ width: `${progressPercentage}%` }}
                />
                <input 
                  type="range"
                  className="timeline-input-clean"
                  min={minTime}
                  max={maxTime}
                  step={calculateStepSize(minTime, maxTime, timeType)}
                  value={currentPlayVal}
                  onChange={(e) => {
                    setIsPlaying(false);
                    setCurrentPlayVal(Number(e.target.value));
                  }}
                />
              </div>
              <div className="timeline-labels-clean">
                <span>{formatPlayValue(minTime, timeType)}</span>
                <span>{formatPlayValue(maxTime, timeType)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Filtered Features Count */}
        {selectedFieldName && minTime !== null && (
          <div className="count-badge">
            <span>Filtered Features</span>
            <span className="count-val">
              {isLoadingCount ? 'Querying...' : activeCount.toLocaleString()}
            </span>
          </div>
        )}

        {/* Playback Transport Bar */}
        {selectedFieldName && minTime !== null && (
          <div className="temporal-section playback-section-clean">
            <div className="playback-controls-row">
              <div className="segmented-playback-bar">
                <button className="playback-bar-btn prev" onClick={stepBack} title="Previous">
                  <ChevronLeft size={18} />
                </button>
                <button
                  className={`playback-bar-btn play-pause ${isPlaying ? 'playing' : ''}`}
                  onClick={() => setIsPlaying(!isPlaying)}
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                </button>
                <button className="playback-bar-btn next" onClick={stepForward} title="Next">
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {/* Reset — compact utility button */}
            <div className="transport-reset-row">
              <button className="transport-reset-btn" onClick={handleReset} title="Reset Timeline">
                <RotateCcw size={15} />
                <span>Reset</span>
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

// --- Mobile & Tablet Temporal Filter Component ---
const MobileTabletTemporalPanel = ({ 
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

  const temporalLayers = layersConfig.filter(l => l.timeEnabled || l.startYear || l.timeField);
  const activeLayer = temporalLayers.find(l => l.id === timelapseSettings.layerId);

  const pushFilter = useCallback((overrides = {}) => {
    setTimelapseSettings(prev => ({
      ...prev,
      ...overrides,
      lastApply: Date.now()
    }));
  }, [setTimelapseSettings]);

  useEffect(() => {
    if (!activeLayer) return;
    setFieldError(null);
    setIsLoadingFields(true);

    const detectFields = async () => {
      try {
        const serviceUrl = activeLayer.url;
        const subLayerUrl = `${getProxyUrl(serviceUrl)}/0?f=pjson`;
        const res = await fetch(subLayerUrl);
        const data = await res.json();

        if (data.fields && data.fields.length > 0) {
          const numericTypes = ['esriFieldTypeSmallInteger', 'esriFieldTypeInteger',
            'esriFieldTypeSingle', 'esriFieldTypeDouble', 'esriFieldTypeDate'];
          const timeFields = data.fields
            .filter(f => numericTypes.includes(f.type))
            .map(f => ({ name: f.name, alias: f.alias || f.name, type: f.type }));

          setAvailableFields(timeFields.length > 0 ? timeFields : [
            { name: activeLayer.timeField || 'SURVEY_YEAR', alias: activeLayer.timeField || 'Survey Year' }
          ]);

          const configField = activeLayer.timeField;
          const matchedField = timeFields.find(f => f.name === configField);
          if (matchedField && !timelapseSettings.timeField) {
            setTimelapseSettings(prev => ({ ...prev, timeField: matchedField.name }));
          } else if (!timelapseSettings.timeField && timeFields.length > 0) {
            setTimelapseSettings(prev => ({ ...prev, timeField: timeFields[0].name }));
          }
        } else {
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
  }, [activeLayer?.id]);

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
        const nextYear = prev.toYear + 1;
        const loopedYear = nextYear > prev.endYear ? prev.startYear : nextYear;
        return {
          ...prev,
          toYear: loopedYear,
          lastApply: Date.now()
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
  }, [timelapseSettings.isPlaying, timelapseSettings.speed]);

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
      lastApply: 0
    }));
  };

  const handleApply = () => {
    stopPlayback();
    pushFilter({});
  };

  const totalYears = timelapseSettings.endYear - timelapseSettings.startYear || 1;
  const fromPct = ((timelapseSettings.fromYear - timelapseSettings.startYear) / totalYears) * 100;
  const toPct   = ((timelapseSettings.toYear   - timelapseSettings.startYear) / totalYears) * 100;

  return (
    <div className="temporal-filter-container">
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

        {timeCompareTab === 'swipe' ? (
          <div className="temporal-section timeline-range-section">
            <label className="temporal-label" style={{ marginBottom: '12px' }}>Comparison Years</label>
            
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

// --- Main Exported Component ---
const TemporalFilterPanel = ({ 
  layersConfig, 
  timelapseSettings, 
  setTimelapseSettings,
  timeCompareTab = 'slider',
  setTimeCompareTab,
  mapView
}) => {
  const [isDesktop, setIsDesktop] = useState(window.innerWidth > 1024);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth > 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isDesktop) {
    return (
      <MobileTabletTemporalPanel
        layersConfig={layersConfig}
        timelapseSettings={timelapseSettings}
        setTimelapseSettings={setTimelapseSettings}
        timeCompareTab={timeCompareTab}
        setTimeCompareTab={setTimeCompareTab}
      />
    );
  }

  return (
    <DesktopTimeLapsePanel
      mapView={mapView}
      timelapseSettings={timelapseSettings}
      setTimelapseSettings={setTimelapseSettings}
    />
  );
};

export default TemporalFilterPanel;
