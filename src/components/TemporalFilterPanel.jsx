import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, RotateCcw, Info, Zap, Clock, Columns2, Square } from 'lucide-react';
import CustomSelect from './CustomSelect';
import TreeSelect from './TreeSelect';
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

const calculateStepSize = (min, max, type, rangeType = 'year') => {
  if (rangeType === 'year') return 1;
  if (type === 'numeric') return 1;
  const rangeMs = max - min;
  const oneDay = 24 * 60 * 60 * 1000;
  const oneMonth = 30 * oneDay;
  const oneYear = 365.25 * oneDay;
  
  if (rangeMs <= oneMonth) return oneDay;
  if (rangeMs <= 2 * oneYear) return oneMonth;
  return oneYear; // Default yearly steps
};

const formatPlayValue = (val, type, rangeType = 'year') => {
  if (val === null || val === undefined) return '';
  if (rangeType === 'year') {
    if (val > 3000) {
      return new Date(val).getFullYear().toString();
    }
    return val.toString();
  }
  if (type === 'numeric' && val < 3000) {
    return `${val}-01-01`;
  }
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
              sublayerId: sub.id,
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
  layersConfig,
  dynamicMapServerData,
  treeData,
  timelapseSettings,
  setTimelapseSettings,
  mapView,
  setLayerVisibility,
  layerVisibility,
  toggleLayer,
  toggleSubLayer
}) => {
  const [layersList, setLayersList] = useState([]);
  const [selectedLayerId, setSelectedLayerId] = useState('');
  const [fieldsList, setFieldsList] = useState([]);
  const [selectedFieldName, setSelectedFieldName] = useState('');
  const [timeType, setTimeType] = useState('numeric');
  const [timeRangeType, setTimeRangeType] = useState('year'); // 'year' | 'date'
  
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

  const selectedLayerItem = layersList.find(l => {
    if (!selectedLayerId) return false;
    if (l.id === selectedLayerId) return true;
    if (selectedLayerId.startsWith(`${l.id}_sub_`)) return true;
    if (l.id.startsWith(`${selectedLayerId}_sub_`)) return true;
    return false;
  });
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
        const isValidType = (type) => {
          if (!type) return false;
          return validTypesRest.includes(type) || validTypesJsApi.includes(type.toLowerCase());
        };
        const isInvalidField = (name) => {
          const n = (name || '').toLowerCase();
          return (
            n.includes('objectid') ||
            n === 'shape' ||
            n.includes('shape_') ||
            n.includes('st_area') ||
            n.includes('st_length') ||
            n === 'fid' ||
            n === 'id'
          );
        };
        const isDateFieldType = (type) => {
          const t = (type || '').toLowerCase();
          return t.includes('date') || t.includes('timestamp');
        };
        const hasDateTimeName = (name, alias) => {
          const n = (name || '').toLowerCase();
          const a = (alias || '').toLowerCase();
          const timeKeywords = ['year', 'date'];
          return timeKeywords.some(keyword => n.includes(keyword) || a.includes(keyword));
        };

        const rootId = selectedLayerId.split('_sub_')[0];
        const config = layersConfig.find(l => l.id === rootId);
        const configField = config?.timeField;

        const filtered = fields.filter(f => {
          if (isInvalidField(f.name)) return false;
          const isConfigField = configField && (f.name.toLowerCase() === configField.toLowerCase());
          if (isConfigField) return true;
          if (!isValidType(f.type)) return false;
          return hasDateTimeName(f.name, f.alias);
        });

        // Prioritize/sort fields so that configured/date-related names are at the top of the selection
        const prioritized = [...filtered].sort((a, b) => {
          const aName = a.name.toLowerCase();
          const bName = b.name.toLowerCase();
          const aIsConfig = configField && aName === configField.toLowerCase();
          const bIsConfig = configField && bName === configField.toLowerCase();
          if (aIsConfig && !bIsConfig) return -1;
          if (!aIsConfig && bIsConfig) return 1;

          const aIsDate = isDateFieldType(a.type);
          const bIsDate = isDateFieldType(b.type);
          if (aIsDate && !bIsDate) return -1;
          if (!aIsDate && bIsDate) return 1;

          return a.name.localeCompare(b.name);
        });

        setFieldsList(prioritized);
        
        if (prioritized.length > 0) {
          const matched = prioritized.find(f => f.name.toLowerCase() === (configField || '').toLowerCase()) || prioritized.find(f => f.name === configField);
          setSelectedFieldName(matched ? matched.name : prioritized[0].name);
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
  }, [selectedLayerId, layersList]);

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

      const computedRangeType = (type === 'date' || type === 'string-date') ? 'date' : 'year';
      setTimeRangeType(computedRangeType);

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
        
        // Handle "Year" vs "Date" Range Types
        if (computedRangeType === 'year') {
          if (type === 'date' || type === 'string-date') {
            const minYear = new Date(min).getFullYear();
            const maxYear = new Date(max).getFullYear();
            if (!isNaN(minYear) && !isNaN(maxYear)) {
              setMinTime(minYear);
              setMaxTime(maxYear);
              setCurrentPlayVal(minYear);
            } else {
              setMinTime(2018);
              setMaxTime(2024);
              setCurrentPlayVal(2018);
            }
          } else {
            setMinTime(Number(min));
            setMaxTime(Number(max));
            setCurrentPlayVal(Number(min));
          }
        } else {
          // date mode: minTime/maxTime are timestamps in milliseconds
          if (type === 'date' || type === 'string-date') {
            const parsedMin = new Date(min).getTime();
            const parsedMax = new Date(max).getTime();
            if (!isNaN(parsedMin) && !isNaN(parsedMax)) {
              setMinTime(parsedMin);
              setMaxTime(parsedMax);
              setCurrentPlayVal(parsedMin);
            } else {
              const defaultMin = new Date('2018-01-01').getTime();
              const defaultMax = new Date('2024-12-31').getTime();
              setMinTime(defaultMin);
              setMaxTime(defaultMax);
              setCurrentPlayVal(defaultMin);
            }
          } else {
            // numeric representation, e.g. year integers, convert to timestamps
            const parsedMin = new Date(`${min}-01-01`).getTime();
            const parsedMax = new Date(`${max}-12-31`).getTime();
            if (!isNaN(parsedMin) && !isNaN(parsedMax)) {
              setMinTime(parsedMin);
              setMaxTime(parsedMax);
              setCurrentPlayVal(parsedMin);
            } else {
              const defaultMin = new Date('2018-01-01').getTime();
              const defaultMax = new Date('2024-12-31').getTime();
              setMinTime(defaultMin);
              setMaxTime(defaultMax);
              setCurrentPlayVal(defaultMin);
            }
          }
        }
      } else {
        if (computedRangeType === 'year') {
          setMinTime(2018);
          setMaxTime(2024);
          setCurrentPlayVal(2018);
        } else {
          const defaultMin = new Date('2018-01-01').getTime();
          const defaultMax = new Date('2024-12-31').getTime();
          setMinTime(defaultMin);
          setMaxTime(defaultMax);
          setCurrentPlayVal(defaultMin);
        }
      }
      
      setIsLoadingRange(false);
    };

    loadRange();
  }, [selectedFieldName, selectedLayerId, layersList]);

  // Animation Playback Effect
  useEffect(() => {
    if (isPlaying && minTime !== null && maxTime !== null) {
      const intervalDuration = SPEED_MAP[playbackSpeed] || 1200;
      const step = calculateStepSize(minTime, maxTime, timeType, timeRangeType);

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
  }, [isPlaying, playbackSpeed, minTime, maxTime, timeType, loopMode, timeRangeType]);

  // Apply map filter and query active count on currentPlayVal change
  useEffect(() => {
    if (!selectedLayerItem || !selectedFieldName || minTime === null || currentPlayVal === null) return;

    // Direct state propagation to App which notifies MapView
    setTimelapseSettings({
      layerId: selectedLayerId,
      timeField: selectedFieldName,
      timeType: timeType,
      timeRangeType: timeRangeType,
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
      if (timeRangeType === 'year') {
        if (timeType === 'date') {
          expression = `${selectedFieldName} >= DATE '${minTime}-01-01' AND ${selectedFieldName} <= DATE '${currentPlayVal}-12-31'`;
        } else if (timeType === 'string-date') {
          expression = `${selectedFieldName} >= '${minTime}-01-01' AND ${selectedFieldName} <= '${currentPlayVal}-12-31'`;
        } else {
          expression = `${selectedFieldName} >= ${minTime} AND ${selectedFieldName} <= ${currentPlayVal}`;
        }
      } else {
        const dateStr = new Date(currentPlayVal).toISOString().split('T')[0];
        const minDateStr = new Date(minTime).toISOString().split('T')[0];
        if (timeType === 'date') {
          expression = `${selectedFieldName} >= DATE '${minDateStr}' AND ${selectedFieldName} <= DATE '${dateStr}'`;
        } else if (timeType === 'string-date') {
          expression = `${selectedFieldName} >= '${minDateStr}' AND ${selectedFieldName} <= '${dateStr}'`;
        } else {
          const minYr = new Date(minTime).getFullYear();
          const currYr = new Date(currentPlayVal).getFullYear();
          expression = `${selectedFieldName} >= ${minYr} AND ${selectedFieldName} <= ${currYr}`;
        }
      }

      setIsLoadingCount(true);
      const count = await getActiveFeatureCount(selectedLayerItem, selectedFieldName, expression);
      setActiveCount(count);
      setIsLoadingCount(false);
    }, 200);

    return () => clearTimeout(debounceTimer);
  }, [currentPlayVal, selectedLayerId, selectedFieldName, timeType, minTime, isPlaying, playbackSpeed, loopMode, timeRangeType]);

  const handleReset = async () => {
    setIsPlaying(false);
    setSelectedLayerId('');
    setSelectedFieldName('');
    setMinTime(null);
    setMaxTime(null);
    setCurrentPlayVal(null);
    setActiveCount(0);
    setTimeRangeType('year');
    
    setTimelapseSettings({
      layerId: '',
      timeField: '',
      timeType: 'numeric',
      timeRangeType: 'year',
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
      const step = calculateStepSize(minTime, maxTime, timeType, timeRangeType);
      setCurrentPlayVal(Math.min(maxTime, currentPlayVal + step));
    }
  };

  const stepBack = () => {
    setIsPlaying(false);
    if (currentPlayVal !== null && minTime !== null) {
      const step = calculateStepSize(minTime, maxTime, timeType, timeRangeType);
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
          <TreeSelect 
            treeData={treeData}
            value={selectedLayerId}
            onChange={(val) => {
              setSelectedLayerId(val);
              setSelectedFieldName('');
              setMinTime(null);
              setMaxTime(null);
              setCurrentPlayVal(null);
              setActiveCount(0);
              // Clear previous results/filters
              setTimelapseSettings(prev => ({
                ...prev,
                layerId: val,
                timeField: '',
                isPlaying: false,
                lastApply: 0
              }));

              // Automatically enable visibility in state so they can see the layer
              if (val) {
                if (val.includes('_sub_')) {
                  const [parentId, subId] = val.split('_sub_');
                  if (typeof toggleSubLayer === 'function') {
                    toggleSubLayer(parentId, isNaN(Number(subId)) ? subId : Number(subId), true);
                  }
                } else {
                  if (typeof setLayerVisibility === 'function') {
                    setLayerVisibility(prev => ({ ...prev, [val]: true }));
                  }
                }
              }
            }}
            placeholder="Select Layer"
          />
        </div>

        {/* Field Selection (Always shown in default state) */}
        <div className="temporal-section">
          <label className="temporal-label">
            Time Field
            {isLoadingFields && <span className="field-loading-dot" />}
          </label>
          <CustomSelect 
            options={fieldsList.map(f => {
              const lowerName = f.name.toLowerCase();
              let title = `${f.name} (${f.alias || f.name})`;
              if (lowerName.includes('year')) {
                title = 'Year';
              } else if (lowerName.includes('date')) {
                title = 'Date';
              }
              return {
                id: f.name,
                title: title
              };
            })}
            value={selectedFieldName}
            onChange={(val) => {
              setSelectedFieldName(val);
              setMinTime(null);
              setMaxTime(null);
              setCurrentPlayVal(null);
              setActiveCount(0);
              setTimelapseSettings(prev => ({
                ...prev,
                timeField: val,
                isPlaying: false,
                lastApply: 0
              }));
            }}
            placeholder="Select Time Field"
            disabled={!selectedLayerId}
          />
        </div>

        {selectedLayerId && selectedFieldName && (
          <>
            {/* Timeline Slider — clean single-track GIS style */}
            {minTime !== null && maxTime !== null && currentPlayVal !== null && (
              <div className="temporal-section timeline-range-section">
                <div className="timeline-header">
                  <label className="temporal-label">Timeline</label>
                  <div className="range-display">
                    <Clock size={13} />
                    <span>{formatPlayValue(currentPlayVal, timeType, timeRangeType)}</span>
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
                      step={calculateStepSize(minTime, maxTime, timeType, timeRangeType)}
                      value={currentPlayVal}
                      onChange={(e) => {
                        setIsPlaying(false);
                        setCurrentPlayVal(Number(e.target.value));
                      }}
                    />
                  </div>
                  <div className="timeline-labels-clean">
                    <span>{formatPlayValue(minTime, timeType, timeRangeType)}</span>
                    <span>{formatPlayValue(maxTime, timeType, timeRangeType)}</span>
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
          </>
        )}

      </div>
    </div>
  );
};

// --- Mobile & Tablet Temporal Filter Component ---
const MobileTabletTemporalPanel = ({ 
  layersConfig, 
  dynamicMapServerData,
  treeData,
  timelapseSettings, 
  setTimelapseSettings,
  timeCompareTab = 'slider',
  setTimeCompareTab,
  mapView,
  setLayerVisibility,
  layerVisibility,
  toggleLayer,
  toggleSubLayer
}) => {
  const [layersList, setLayersList] = useState([]);
  const [selectedLayerId, setSelectedLayerId] = useState('');
  const [fieldsList, setFieldsList] = useState([]);
  const [selectedFieldName, setSelectedFieldName] = useState('');
  const [timeType, setTimeType] = useState('numeric');
  const [timeRangeType, setTimeRangeType] = useState('year'); // 'year' | 'date'
  
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

  const selectedLayerItem = layersList.find(l => {
    if (!selectedLayerId) return false;
    if (l.id === selectedLayerId) return true;
    if (selectedLayerId.startsWith(`${l.id}_sub_`)) return true;
    if (l.id.startsWith(`${selectedLayerId}_sub_`)) return true;
    return false;
  });
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
        const isValidType = (type) => {
          if (!type) return false;
          return validTypesRest.includes(type) || validTypesJsApi.includes(type.toLowerCase());
        };
        const isInvalidField = (name) => {
          const n = (name || '').toLowerCase();
          return (
            n.includes('objectid') ||
            n === 'shape' ||
            n.includes('shape_') ||
            n.includes('st_area') ||
            n.includes('st_length') ||
            n === 'fid' ||
            n === 'id'
          );
        };
        const isDateFieldType = (type) => {
          const t = (type || '').toLowerCase();
          return t.includes('date') || t.includes('timestamp');
        };
        const hasDateTimeName = (name, alias) => {
          const n = (name || '').toLowerCase();
          const a = (alias || '').toLowerCase();
          const timeKeywords = ['year', 'date'];
          return timeKeywords.some(keyword => n.includes(keyword) || a.includes(keyword));
        };

        const rootId = selectedLayerId.split('_sub_')[0];
        const config = layersConfig.find(l => l.id === rootId);
        const configField = config?.timeField;

        const filtered = fields.filter(f => {
          if (isInvalidField(f.name)) return false;
          const isConfigField = configField && (f.name.toLowerCase() === configField.toLowerCase());
          if (isConfigField) return true;
          if (!isValidType(f.type)) return false;
          return hasDateTimeName(f.name, f.alias);
        });

        const prioritized = [...filtered].sort((a, b) => {
          const aName = a.name.toLowerCase();
          const bName = b.name.toLowerCase();
          const aIsConfig = configField && aName === configField.toLowerCase();
          const bIsConfig = configField && bName === configField.toLowerCase();
          if (aIsConfig && !bIsConfig) return -1;
          if (!aIsConfig && bIsConfig) return 1;

          const aIsDate = isDateFieldType(a.type);
          const bIsDate = isDateFieldType(b.type);
          if (aIsDate && !bIsDate) return -1;
          if (!aIsDate && bIsDate) return 1;

          return a.name.localeCompare(b.name);
        });

        setFieldsList(prioritized);
        
        if (prioritized.length > 0) {
          const matched = prioritized.find(f => f.name.toLowerCase() === (configField || '').toLowerCase()) || prioritized.find(f => f.name === configField);
          setSelectedFieldName(matched ? matched.name : prioritized[0].name);
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
  }, [selectedLayerId, layersList]);

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

      const computedRangeType = (type === 'date' || type === 'string-date') ? 'date' : 'year';
      setTimeRangeType(computedRangeType);

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
        
        // Handle "Year" vs "Date" Range Types
        if (computedRangeType === 'year') {
          if (type === 'date' || type === 'string-date') {
            const minYear = new Date(min).getFullYear();
            const maxYear = new Date(max).getFullYear();
            if (!isNaN(minYear) && !isNaN(maxYear)) {
              setMinTime(minYear);
              setMaxTime(maxYear);
              setCurrentPlayVal(minYear);
            } else {
              setMinTime(2018);
              setMaxTime(2024);
              setCurrentPlayVal(2018);
            }
          } else {
            setMinTime(Number(min));
            setMaxTime(Number(max));
            setCurrentPlayVal(Number(min));
          }
        } else {
          // date mode: minTime/maxTime are timestamps in milliseconds
          if (type === 'date' || type === 'string-date') {
            const parsedMin = new Date(min).getTime();
            const parsedMax = new Date(max).getTime();
            if (!isNaN(parsedMin) && !isNaN(parsedMax)) {
              setMinTime(parsedMin);
              setMaxTime(parsedMax);
              setCurrentPlayVal(parsedMin);
            } else {
              const defaultMin = new Date('2018-01-01').getTime();
              const defaultMax = new Date('2024-12-31').getTime();
              setMinTime(defaultMin);
              setMaxTime(defaultMax);
              setCurrentPlayVal(defaultMin);
            }
          } else {
            const parsedMin = new Date(`${min}-01-01`).getTime();
            const parsedMax = new Date(`${max}-12-31`).getTime();
            if (!isNaN(parsedMin) && !isNaN(parsedMax)) {
              setMinTime(parsedMin);
              setMaxTime(parsedMax);
              setCurrentPlayVal(parsedMin);
            } else {
              const defaultMin = new Date('2018-01-01').getTime();
              const defaultMax = new Date('2024-12-31').getTime();
              setMinTime(defaultMin);
              setMaxTime(defaultMax);
              setCurrentPlayVal(defaultMin);
            }
          }
        }
      } else {
        if (computedRangeType === 'year') {
          setMinTime(2018);
          setMaxTime(2024);
          setCurrentPlayVal(2018);
        } else {
          const defaultMin = new Date('2018-01-01').getTime();
          const defaultMax = new Date('2024-12-31').getTime();
          setMinTime(defaultMin);
          setMaxTime(defaultMax);
          setCurrentPlayVal(defaultMin);
        }
      }
      
      setIsLoadingRange(false);
    };

    loadRange();
  }, [selectedFieldName, selectedLayerId, layersList]);

  // Animation Playback Effect
  useEffect(() => {
    if (isPlaying && minTime !== null && maxTime !== null) {
      const intervalDuration = SPEED_MAP[playbackSpeed] || 1200;
      const step = calculateStepSize(minTime, maxTime, timeType, timeRangeType);

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
  }, [isPlaying, playbackSpeed, minTime, maxTime, timeType, loopMode, timeRangeType]);

  // Apply map filter and query active count on currentPlayVal change
  useEffect(() => {
    if (!selectedLayerItem || !selectedFieldName || minTime === null || currentPlayVal === null) return;

    // Direct state propagation to App which notifies MapView
    setTimelapseSettings({
      layerId: selectedLayerId,
      timeField: selectedFieldName,
      timeType: timeType,
      timeRangeType: timeRangeType,
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
      if (timeRangeType === 'year') {
        if (timeType === 'date') {
          expression = `${selectedFieldName} >= DATE '${minTime}-01-01' AND ${selectedFieldName} <= DATE '${currentPlayVal}-12-31'`;
        } else if (timeType === 'string-date') {
          expression = `${selectedFieldName} >= '${minTime}-01-01' AND ${selectedFieldName} <= '${currentPlayVal}-12-31'`;
        } else {
          expression = `${selectedFieldName} >= ${minTime} AND ${selectedFieldName} <= ${currentPlayVal}`;
        }
      } else {
        const dateStr = new Date(currentPlayVal).toISOString().split('T')[0];
        const minDateStr = new Date(minTime).toISOString().split('T')[0];
        if (timeType === 'date') {
          expression = `${selectedFieldName} >= DATE '${minDateStr}' AND ${selectedFieldName} <= DATE '${dateStr}'`;
        } else if (timeType === 'string-date') {
          expression = `${selectedFieldName} >= '${minDateStr}' AND ${selectedFieldName} <= '${dateStr}'`;
        } else {
          const minYr = new Date(minTime).getFullYear();
          const currYr = new Date(currentPlayVal).getFullYear();
          expression = `${selectedFieldName} >= ${minYr} AND ${selectedFieldName} <= ${currYr}`;
        }
      }

      setIsLoadingCount(true);
      const count = await getActiveFeatureCount(selectedLayerItem, selectedFieldName, expression);
      setActiveCount(count);
      setIsLoadingCount(false);
    }, 200);

    return () => clearTimeout(debounceTimer);
  }, [currentPlayVal, selectedLayerId, selectedFieldName, timeType, minTime, isPlaying, playbackSpeed, loopMode, timeRangeType]);

  const handleReset = async () => {
    setIsPlaying(false);
    setSelectedLayerId('');
    setSelectedFieldName('');
    setMinTime(null);
    setMaxTime(null);
    setCurrentPlayVal(null);
    setActiveCount(0);
    setTimeRangeType('year');
    
    setTimelapseSettings({
      layerId: '',
      timeField: '',
      timeType: 'numeric',
      timeRangeType: 'year',
      fromYear: 2018,
      toYear: 2024,
      startYear: 2018,
      endYear: 2024,
      isPlaying: false,
      lastApply: 0 // clears filters
    });
  };

  const handleApply = () => {
    setIsPlaying(false);
    setTimelapseSettings({
      layerId: selectedLayerId,
      timeField: selectedFieldName,
      timeType: timeType,
      timeRangeType: timeRangeType,
      fromYear: minTime,
      toYear: currentPlayVal,
      startYear: minTime,
      endYear: maxTime,
      isPlaying: false,
      speed: playbackSpeed,
      loop: loopMode,
      lastApply: Date.now()
    });
  };

  const stepForward = () => {
    setIsPlaying(false);
    if (currentPlayVal !== null && maxTime !== null) {
      const step = calculateStepSize(minTime, maxTime, timeType, timeRangeType);
      setCurrentPlayVal(Math.min(maxTime, currentPlayVal + step));
    }
  };

  const stepBack = () => {
    setIsPlaying(false);
    if (currentPlayVal !== null && minTime !== null) {
      const step = calculateStepSize(minTime, maxTime, timeType, timeRangeType);
      setCurrentPlayVal(Math.max(minTime, currentPlayVal - step));
    }
  };

  const progressPercentage = (minTime !== null && maxTime !== null && currentPlayVal !== null)
    ? ((currentPlayVal - minTime) / (maxTime - minTime)) * 100
    : 0;

  return (
    <div className="temporal-filter-container">
      {selectedLayerId && selectedFieldName && (
        <div className="temporal-tab-container">
          <button 
            className={`temporal-tab-btn ${timeCompareTab === 'slider' ? 'active' : ''}`}
            onClick={() => {
              setIsPlaying(false);
              setTimeCompareTab('slider');
            }}
          >
            <Clock size={14} />
            <span>Timeline Filter</span>
          </button>
          <button 
            className={`temporal-tab-btn ${timeCompareTab === 'swipe' ? 'active' : ''}`}
            onClick={() => {
              setIsPlaying(false);
              setTimeCompareTab('swipe');
            }}
          >
            <Columns2 size={14} />
            <span>Swipe Compare</span>
          </button>
        </div>
      )}

      <div className="temporal-filter-body">
        {selectedLayerId && selectedFieldName && minTime !== null && (
          <div className="temporal-active-badge">
            <Zap size={13} />
            <span>
              {timeCompareTab === 'swipe'
                ? `Compare: ${formatPlayValue(minTime, timeType, timeRangeType)} | ${formatPlayValue(currentPlayVal, timeType, timeRangeType)}`
                : `Filter Active: ${formatPlayValue(minTime, timeType, timeRangeType)} — ${formatPlayValue(currentPlayVal, timeType, timeRangeType)}`}
            </span>
          </div>
        )}

        {/* Layer Selection */}
        <div className="temporal-section">
          <label className="temporal-label">Select Layer</label>
          <TreeSelect 
            treeData={treeData}
            value={selectedLayerId}
            onChange={(val) => {
              setSelectedLayerId(val);
              setSelectedFieldName('');
              setMinTime(null);
              setMaxTime(null);
              setCurrentPlayVal(null);
              setActiveCount(0);
              setTimelapseSettings(prev => ({
                ...prev,
                layerId: val,
                timeField: '',
                isPlaying: false,
                lastApply: 0
              }));

              // Automatically enable visibility in state so they can see the layer
              if (val) {
                if (val.includes('_sub_')) {
                  const [parentId, subId] = val.split('_sub_');
                  if (typeof toggleSubLayer === 'function') {
                    toggleSubLayer(parentId, isNaN(Number(subId)) ? subId : Number(subId), true);
                  }
                } else {
                  if (typeof setLayerVisibility === 'function') {
                    setLayerVisibility(prev => ({ ...prev, [val]: true }));
                  }
                }
              }
            }}
            placeholder="Select Layer"
          />
        </div>

        {/* Field Selection (Always shown in default state) */}
        <div className="temporal-section">
          <label className="temporal-label">
            Time Field
            {isLoadingFields && <span className="field-loading-dot" />}
          </label>
          <CustomSelect 
            options={fieldsList.map(f => {
              const lowerName = f.name.toLowerCase();
              let title = `${f.name} (${f.alias || f.name})`;
              if (lowerName.includes('year')) {
                title = 'Year';
              } else if (lowerName.includes('date')) {
                title = 'Date';
              }
              return {
                id: f.name,
                title: title
              };
            })}
            value={selectedFieldName}
            onChange={(val) => {
              setSelectedFieldName(val);
              setMinTime(null);
              setMaxTime(null);
              setCurrentPlayVal(null);
              setActiveCount(0);
              setTimelapseSettings(prev => ({
                ...prev,
                timeField: val,
                isPlaying: false,
                lastApply: 0
              }));
            }}
            placeholder="Select Time Field"
            disabled={!selectedLayerId}
          />
        </div>

        {selectedLayerId && selectedFieldName && (
          <>

            {timeCompareTab === 'swipe' ? (
              <div className="temporal-section timeline-range-section">
                <label className="temporal-label" style={{ marginBottom: '12px' }}>Comparison Years</label>
                
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px', fontWeight: '600' }}>
                    <span style={{ color: '#64748b' }}>Left Side Value</span>
                    <span style={{ color: '#1e3c72', fontWeight: 'bold' }}>{formatPlayValue(minTime, timeType, timeRangeType)}</span>
                  </div>
                  <input 
                    type="range"
                    className="range-thumb single-slider"
                    min={minTime}
                    max={maxTime}
                    value={minTime}
                    disabled={true}
                    style={{ width: '100%', opacity: 0.7 }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px', fontWeight: '600' }}>
                    <span style={{ color: '#64748b' }}>Right Side Value</span>
                    <span style={{ color: '#1e3c72', fontWeight: 'bold' }}>{formatPlayValue(currentPlayVal, timeType, timeRangeType)}</span>
                  </div>
                  <input 
                    type="range"
                    className="range-thumb single-slider"
                    min={minTime}
                    max={maxTime}
                    step={calculateStepSize(minTime, maxTime, timeType, timeRangeType)}
                    value={currentPlayVal}
                    onChange={(e) => {
                      setIsPlaying(false);
                      setCurrentPlayVal(Number(e.target.value));
                    }}
                    style={{ width: '100%', cursor: 'pointer' }}
                  />
                </div>
              </div>
            ) : (
              <div className="temporal-section timeline-range-section">
                <div className="timeline-header">
                  <label className="temporal-label">Timeline</label>
                  <div className="range-display">
                    <Clock size={13} />
                    <span>{formatPlayValue(currentPlayVal, timeType, timeRangeType)}</span>
                  </div>
                </div>

                <div className="timeline-slider-clean" style={{ margin: '10px 0 20px 0' }}>
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
                      step={calculateStepSize(minTime, maxTime, timeType, timeRangeType)}
                      value={currentPlayVal}
                      onChange={(e) => {
                        setIsPlaying(false);
                        setCurrentPlayVal(Number(e.target.value));
                      }}
                    />
                  </div>
                  <div className="timeline-labels-clean">
                    <span>{formatPlayValue(minTime, timeType, timeRangeType)}</span>
                    <span>{formatPlayValue(maxTime, timeType, timeRangeType)}</span>
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
                      className={`speed-btn ${playbackSpeed === s ? 'active' : ''}`}
                      onClick={() => setPlaybackSpeed(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {timeCompareTab === 'slider' && minTime !== null && (
              <div className="temporal-section playback-controls-section">
                <div className="playback-group">
                  <button className="playback-btn secondary" onClick={stepBack} title="Previous">
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    className={`playback-btn primary ${isPlaying ? 'active' : ''}`}
                    onClick={() => setIsPlaying(!isPlaying)}
                  >
                    {isPlaying
                      ? <Pause size={22} fill="currentColor" />
                      : <Play size={22} fill="currentColor" />}
                  </button>
                  <button className="playback-btn secondary" onClick={stepForward} title="Next">
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>
            )}

            {/* Filtered Features Count */}
            {selectedFieldName && minTime !== null && (
              <div className="count-badge" style={{ margin: '15px 0' }}>
                <span>Filtered Features</span>
                <span className="count-val">
                  {isLoadingCount ? 'Querying...' : activeCount.toLocaleString()}
                </span>
              </div>
            )}

            <div className="info-box-v4" style={{ marginTop: '15px' }}>
              <Info size={14} />
              <span>
                {timeCompareTab === 'swipe'
                  ? 'Creates a swipe divider comparing starting value vs current slider value.'
                  : 'Applies dynamic spatial filters. Use play controls to animate.'}
              </span>
            </div>
          </>
        )}
      </div>

      {selectedLayerId && selectedFieldName && (
        <div className="temporal-footer">
          <button className="temporal-btn-secondary" onClick={handleReset}>
            <RotateCcw size={15} /> Reset
          </button>
          <button
            className="temporal-btn-primary"
            onClick={handleApply}
            disabled={!selectedLayerId || !selectedFieldName}
          >
            {timeCompareTab === 'swipe' ? 'Apply Compare' : 'Apply Filter'}
          </button>
        </div>
      )}
    </div>
  );
};

const TemporalFilterPanel = ({ 
  layersConfig, 
  dynamicMapServerData,
  timelapseSettings, 
  setTimelapseSettings,
  timeCompareTab = 'slider',
  setTimeCompareTab,
  mapView,
  treeData,
  setLayerVisibility,
  layerVisibility,
  toggleLayer,
  toggleSubLayer
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
        mapView={mapView}
        layersConfig={layersConfig}
        dynamicMapServerData={dynamicMapServerData}
        treeData={treeData}
        timelapseSettings={timelapseSettings}
        setTimelapseSettings={setTimelapseSettings}
        timeCompareTab={timeCompareTab}
        setTimeCompareTab={setTimeCompareTab}
        setLayerVisibility={setLayerVisibility}
        layerVisibility={layerVisibility}
        toggleLayer={toggleLayer}
        toggleSubLayer={toggleSubLayer}
      />
    );
  }

  return (
    <DesktopTimeLapsePanel
      mapView={mapView}
      layersConfig={layersConfig}
      dynamicMapServerData={dynamicMapServerData}
      treeData={treeData}
      timelapseSettings={timelapseSettings}
      setTimelapseSettings={setTimelapseSettings}
      setLayerVisibility={setLayerVisibility}
      layerVisibility={layerVisibility}
      toggleLayer={toggleLayer}
      toggleSubLayer={toggleSubLayer}
    />
  );
};

export default TemporalFilterPanel;
