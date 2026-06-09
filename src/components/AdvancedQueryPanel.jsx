import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, X, Plus, Filter, Trash2, ArrowRight, ArrowLeft, Play, Check, 
  RotateCcw, SlidersHorizontal, RefreshCw, ZoomIn, Info, AlertTriangle, ChevronDown, Pencil
} from 'lucide-react';
import Graphic from '@arcgis/core/Graphic';
import TreeSelect from './TreeSelect';
import CustomSelect from './CustomSelect';
import { useLanguage } from '../context/LanguageContext';
import './AdvancedQueryPanel.css';

// Proxy helper for local dev
const getProxyUrl = (url) => {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    if (url.includes('https://gis9.smartgeoapps.com')) {
      return url.replace('https://gis9.smartgeoapps.com', '/arcgis-proxy');
    }
    if (url.includes('https://gis12.smartgeoapps.com')) {
      return url.replace('https://gis12.smartgeoapps.com', '/arcgis-proxy-gis12');
    }
  }
  return url;
};

// Bahrain geometry safety guard
const isValidBahrainGeometry = (geom, view) => {
  if (!geom) return false;
  
  // Log the debug info as requested by the user
  console.log("Extent:", geom.extent);
  console.log("Spatial Reference:", geom.spatialReference);
  if (view) {
    console.log("Scale:", view.scale);
  }

  // Get extent or center
  let extent = geom.extent;
  if (!extent && geom.type === 'point') {
    extent = { xmin: geom.x, xmax: geom.x, ymin: geom.y, ymax: geom.y };
  }
  if (!extent) return true; // fallback
  
  const sr = geom.spatialReference;
  const isWebMercator = sr && (sr.wkid === 3857 || sr.wkid === 102100 || sr.latestWkid === 3857 || sr.latestWkid === 102100);
  
  if (isWebMercator) {
    // Web Mercator bounds for Bahrain: X: 5.4M to 5.8M, Y: 2.8M to 3.2M
    if (Math.abs(extent.xmin) < 1000 && Math.abs(extent.ymin) < 1000) return false;
    return extent.xmin >= 5400000 && extent.xmax <= 5800000 &&
           extent.ymin >= 2800000 && extent.ymax <= 3200000;
  } else {
    // WGS84 bounds for Bahrain: Longitude 49.5 to 51.5, Latitude 24.5 to 27.5
    if (Math.abs(extent.xmin) < 0.1 && Math.abs(extent.ymin) < 0.1) return false;
    return extent.xmin >= 49.5 && extent.xmax <= 51.5 &&
           extent.ymin >= 24.5 && extent.ymax <= 27.5;
  }
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
              title: sub.title || sub.name,
              type: "map-image-sublayer",
              rawLayer: sub,
              parentLayer: layer
            });
          }
        });
      }
    } else if (layer.type === "feature" || layer.type === "geojson") {
      result.push({
        id: layer.id,
        title: layer.title,
        type: layer.type,
        rawLayer: layer
      });
    }
  }

  map.layers.forEach(collect);
  return result;
};

// Helper: Fetch field configurations of selected layer
const getLayerFields = async (layerItem) => {
  const { type, rawLayer } = layerItem;
  
  if (type === "map-image-sublayer") {
    const parentUrl = layerItem.parentLayer.url;
    const sublayerId = layerItem.sublayerId;
    const queryUrl = `${parentUrl}/${sublayerId}?f=json`;
    
    const proxyUrl = getProxyUrl(queryUrl);
    const res = await fetch(proxyUrl);
    const data = await res.json();
    return data.fields || [];
  } else {
    // FeatureLayer / GeoJSONLayer
    if (!rawLayer.loaded) {
      await rawLayer.load();
    }
    return rawLayer.fields || [];
  }
};

// Helper: Query distinct unique values from Feature Server or client layer
const getFieldUniqueValues = async (layerItem, fieldName) => {
  const { type, rawLayer } = layerItem;
  
  try {
    let queryUrl = "";
    if (type === "map-image-sublayer") {
      const parentUrl = layerItem.parentLayer.url;
      const sublayerId = layerItem.sublayerId;
      queryUrl = `${parentUrl}/${sublayerId}/query`;
      
      const params = new URLSearchParams();
      params.append("f", "json");
      params.append("where", "1=1");
      params.append("outFields", fieldName);
      params.append("returnGeometry", "false");
      params.append("returnDistinctValues", "true");
      params.append("resultRecordCount", "200");
      
      const proxyUrl = getProxyUrl(queryUrl);
      const res = await fetch(proxyUrl, { method: "POST", body: params });
      const data = await res.json();
      if (data && data.features) {
        return data.features
          .map(f => f.attributes[fieldName])
          .filter(v => v !== null && v !== undefined);
      }
    } else {
      const query = rawLayer.createQuery();
      query.where = "1=1";
      query.outFields = [fieldName];
      query.returnGeometry = false;
      query.returnDistinctValues = true;
      query.resultRecordCount = 200;
      
      const featureSet = await rawLayer.queryFeatures(query);
      if (featureSet && featureSet.features) {
        return featureSet.features
          .map(f => f.attributes[fieldName])
          .filter(v => v !== null && v !== undefined);
      }
    }
  } catch (e) {
    console.warn("Distinct query failed, falling back to full memory scan:", e.message);
  }
  
  // Fallback scan
  try {
    let features = [];
    if (type === "map-image-sublayer") {
      const parentUrl = layerItem.parentLayer.url;
      const sublayerId = layerItem.sublayerId;
      const queryUrl = `${parentUrl}/${sublayerId}/query`;
      const params = new URLSearchParams();
      params.append("f", "json");
      params.append("where", "1=1");
      params.append("outFields", fieldName);
      params.append("returnGeometry", "false");
      params.append("resultRecordCount", "500");
      const proxyUrl = getProxyUrl(queryUrl);
      const res = await fetch(proxyUrl, { method: "POST", body: params });
      const data = await res.json();
      features = data.features || [];
    } else {
      const query = rawLayer.createQuery();
      query.where = "1=1";
      query.outFields = [fieldName];
      query.returnGeometry = false;
      query.resultRecordCount = 500;
      const featureSet = await rawLayer.queryFeatures(query);
      features = featureSet.features || [];
    }
    
    const vals = features
      .map(f => f.attributes[fieldName])
      .filter(v => v !== null && v !== undefined);
    return Array.from(new Set(vals));
  } catch (err) {
    console.error("Fallback distinct query failed:", err);
    return [];
  }
};

const getFieldCategory = (fieldType) => {
  if (!fieldType) return 'text';
  const typeLower = fieldType.toLowerCase();
  
  if (typeLower.includes('string') || typeLower.includes('guid') || typeLower.includes('globalid') || typeLower === 'string') {
    return 'text';
  }
  
  if (typeLower.includes('date') || typeLower === 'date') {
    return 'date';
  }
  
  return 'numeric';
};

const OPERATORS_BY_CATEGORY = {
  text: [
    { id: '=', label: '=' },
    { id: '<>', label: '<>' },
    { id: 'LIKE', label: 'LIKE' },
    { id: 'NOT LIKE', label: 'NOT LIKE' },
    { id: 'STARTS WITH', label: 'STARTS WITH' },
    { id: 'ENDS WITH', label: 'ENDS WITH' },
    { id: 'CONTAINS', label: 'CONTAINS' },
    { id: 'IN', label: 'IN' },
    { id: 'NOT IN', label: 'NOT IN' },
    { id: 'INCLUDE', label: 'INCLUDE' },
    { id: 'NOT INCLUDE', label: 'NOT INCLUDE' },
    { id: 'IS NULL', label: 'IS NULL' },
    { id: 'IS NOT NULL', label: 'IS NOT NULL' }
  ],
  numeric: [
    { id: '=', label: '=' },
    { id: '<>', label: '<>' },
    { id: '>', label: '>' },
    { id: '<', label: '<' },
    { id: '>=', label: '>=' },
    { id: '<=', label: '<=' },
    { id: 'BETWEEN', label: 'BETWEEN' },
    { id: 'NOT BETWEEN', label: 'NOT BETWEEN' },
    { id: 'IN', label: 'IN' },
    { id: 'NOT IN', label: 'NOT IN' },
    { id: 'INCLUDE', label: 'INCLUDE' },
    { id: 'NOT INCLUDE', label: 'NOT INCLUDE' },
    { id: 'IS NULL', label: 'IS NULL' },
    { id: 'IS NOT NULL', label: 'IS NOT NULL' }
  ],
  date: [
    { id: '=', label: '=' },
    { id: '>', label: '>' },
    { id: '<', label: '<' },
    { id: '>=', label: '>=' },
    { id: '<=', label: '<=' },
    { id: 'BETWEEN', label: 'BETWEEN' },
    { id: 'NOT BETWEEN', label: 'NOT BETWEEN' },
    { id: 'IS NULL', label: 'IS NULL' },
    { id: 'IS NOT NULL', label: 'IS NOT NULL' }
  ]
};

const UniqueValueCombobox = ({ uniqueValues, value, onChange, placeholder, isRTL }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const clickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', clickOutside);
    return () => document.removeEventListener('mousedown', clickOutside);
  }, []);

  const filtered = (uniqueValues || []).filter(v => 
    String(v).toLowerCase().includes(String(value || '').toLowerCase())
  );

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', position: 'relative', width: '100%' }}>
        <input 
          type="text" 
          className="aq-input-text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ 
            height: '36px', 
            width: '100%', 
            boxSizing: 'border-box', 
            padding: isRTL ? '0 8px 0 32px' : '0 32px 0 8px'
          }}
        />
        <button 
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          style={{ 
            position: 'absolute', 
            [isRTL ? 'left' : 'right']: '4px', 
            background: 'none', 
            border: 'none', 
            color: '#64748b', 
            cursor: 'pointer',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            padding: 0
          }}
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {isOpen && uniqueValues && uniqueValues.length > 0 && (
        <div className="custom-select-dropdown" style={{ 
          position: 'absolute', 
          top: 'calc(100% + 4px)', 
          left: 0, 
          width: '100%', 
          zIndex: 1100, 
          maxHeight: '160px', 
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          background: 'white',
          overflow: 'hidden'
        }}>
          <div className="options-list" style={{ padding: '4px 0', maxHeight: '150px', overflowY: 'auto' }}>
            {(filtered.length > 0 ? filtered : uniqueValues).map((val, idx) => (
              <div 
                key={idx} 
                className="option-item" 
                onClick={() => {
                  onChange(String(val));
                  setIsOpen(false);
                }}
                style={{ 
                  padding: '8px 12px', 
                  cursor: 'pointer', 
                  fontSize: '12px',
                  color: '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f8fafc';
                  e.currentTarget.style.color = '#1a2f4d';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#475569';
                }}
              >
                {String(val)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const SELECTION_TYPES = [
  { id: 'NEW', titleEn: 'New Selection', titleAr: 'تحديد جديد' },
  { id: 'ADD', titleEn: 'Add To Selection', titleAr: 'إضافة إلى التحديد' },
  { id: 'REMOVE', titleEn: 'Remove From Selection', titleAr: 'إزالة من التحديد' },
  { id: 'SUBSET', titleEn: 'Select From Current Selection', titleAr: 'تحديد من التحديد الحالي' }
];

const AdvancedQueryPanel = ({ 
  mapView,
  treeData,
  layersConfig,
  dynamicMapServerData,
  results: addDataResults,
  setResults: setAddDataResults,
  layerOrder,
  setLayerOrder,
  layerVisibility,
  setLayerVisibility
}) => {
  const { t, lang } = useLanguage();
  const isRTL = lang === 'AR';

  const [layersList, setLayersList] = useState([]);
  const [selectedLayerId, setSelectedLayerId] = useState('');
  
  const [fieldsList, setFieldsList] = useState([]);
  const [selectedFieldName, setSelectedFieldName] = useState('');
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  const [cachedFields, setCachedFields] = useState({});

  // Selection Type state
  const [selectionType, setSelectionType] = useState('');
  const highlightHandleRef = useRef(null);

  const [step, setStep] = useState(1);

  const [validationError, setValidationError] = useState('');

  // SQL code mode and preview states
  const [sqlCodeMode, setSqlCodeMode] = useState(false);
  const [rawSqlText, setRawSqlText] = useState('');
  const [sqlPreview, setSqlPreview] = useState('');

  const validateSqlExpression = (sql) => {
    if (!sql.trim()) return { valid: false, error: isRTL ? 'تعبير الاستعلام فارغ.' : 'SQL expression is empty.' };
    const quotesCount = (sql.match(/'/g) || []).length;
    if (quotesCount % 2 !== 0) {
      return { valid: false, error: isRTL ? 'علامات اقتباس فردية غير متطابقة في تعبير SQL.' : 'Mismatched single quotes in SQL expression.' };
    }
    const openParens = (sql.match(/\(/g) || []).length;
    const closeParens = (sql.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      return { valid: false, error: isRTL ? 'أقواس غير متطابقة في تعبير SQL.' : 'Mismatched parentheses in SQL expression.' };
    }
    return { valid: true };
  };

  const activeSqlExpression = sqlCodeMode ? rawSqlText : sqlPreview;

  // Live SQL Validation
  useEffect(() => {
    if (!activeSqlExpression.trim()) {
      setValidationError('');
      return;
    }
    const valResult = validateSqlExpression(activeSqlExpression);
    if (!valResult.valid) {
      setValidationError(valResult.error);
    } else {
      setValidationError('');
    }
  }, [activeSqlExpression, isRTL]);

  // Multi-Clause list state
  const [clauses, setClauses] = useState([
    { id: '1', logicalOp: 'WHERE', fieldName: '', operator: '=', value: '', customValue: '', uniqueValues: [], isLoadingValues: false }
  ]);

  // Results list
  const [results, setResults] = useState([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const [hasQueried, setHasQueried] = useState(false);
  const [highlightedFeatureId, setHighlightedFeatureId] = useState(null);

  // Selected checkboxes for temporary layer
  const [checkedOids, setCheckedOids] = useState([]);
  const [mergeSelected, setMergeSelected] = useState(true);
  const [toastMessage, setToastMessage] = useState('');
  const [layersCount, setLayersCount] = useState(0);

  const [customNames, setCustomNames] = useState({});
  const [editingFeature, setEditingFeature] = useState(null); // { feature, index }
  const [newNameValue, setNewNameValue] = useState("");

  const getFeatureKey = (feature, index) => {
    if (!feature || !feature.attributes) return `idx-${index}`;
    const oidField = selectedLayerItem?.rawLayer?.objectIdField || 'OBJECTID';
    const oid = feature.attributes[oidField];
    if (oid !== undefined && oid !== null) {
      return `oid-${oid}`;
    }
    return `idx-${index}`;
  };

  const handleSaveRename = () => {
    if (!editingFeature) return;
    const key = getFeatureKey(editingFeature.feature, editingFeature.index);
    if (newNameValue.trim()) {
      setCustomNames(prev => ({
        ...prev,
        [key]: newNameValue.trim()
      }));
    } else {
      setCustomNames(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    setEditingFeature(null);
  };

  useEffect(() => {
    if (!mapView || !mapView.map) return;
    
    setLayersCount(mapView.map.layers.length);

    const handle = mapView.map.layers.on("change", () => {
      setLayersCount(mapView.map.layers.length);
    });

    return () => {
      handle.remove();
    };
  }, [mapView]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };


  // Dynamic treeData fallback builder
  const builtTreeData = useMemo(() => {
    if (treeData && treeData.length > 0) return treeData;
    if (!layersConfig) return [];
    
    const tree = [];
    layersConfig.forEach(l => {
      if (l.type === 'feature') {
        tree.push({
          id: l.id,
          title: l.title,
          type: 'feature',
          selectable: true,
          children: []
        });
      }
      else if (l.type === 'map-image') {
        const mapData = dynamicMapServerData?.[l.id];
        if (mapData && mapData.metadata && mapData.metadata.layers) {
          const sublayers = mapData.metadata.layers;
          
          const buildNode = (sub) => {
            const subId = `${l.id}_sub_${sub.id}`;
            const hasChildren = sub.subLayerIds && sub.subLayerIds.length > 0;

            if (hasChildren) {
              const childrenNodes = [];
              sub.subLayerIds.forEach(childId => {
                const childSub = sublayers.find(s => s.id === childId);
                if (childSub) {
                  const childNode = buildNode(childSub);
                  if (childNode) {
                    childrenNodes.push(childNode);
                  }
                }
              });
              
              if (childrenNodes.length > 0) {
                return {
                  id: subId,
                  title: sub.name || sub.title,
                  type: 'group',
                  selectable: false,
                  children: childrenNodes
                };
              }
              return null;
            } else {
              return {
                id: subId,
                title: sub.name || sub.title,
                type: 'feature',
                selectable: true,
                children: []
              };
            }
          };

          const roots = sublayers.filter(s => s.parentLayerId === -1);
          const layerChildren = roots.map(r => buildNode(r)).filter(Boolean);

          if (layerChildren.length > 0) {
            tree.push({
              id: l.id,
              title: l.title,
              type: 'group',
              selectable: false,
              children: layerChildren
            });
          }
        } else {
          tree.push({
            id: l.id,
            title: l.title,
            type: 'group',
            selectable: false,
            children: []
          });
        }
      }
    });
    return tree;
  }, [treeData, layersConfig, dynamicMapServerData]);

  // Selected layer config items
  const selectedLayerItem = useMemo(() => {
    return layersList.find(l => 
      l.id === selectedLayerId || 
      l.id === `${selectedLayerId}_sub_0` || 
      (selectedLayerId && l.id.startsWith(`${selectedLayerId}_sub_`))
    );
  }, [selectedLayerId, layersList]);

  // Auto-check all query results on query complete
  useEffect(() => {
    if (results && results.length > 0) {
      const oidField = selectedLayerItem?.rawLayer?.objectIdField || 'OBJECTID';
      setCheckedOids(results.map(f => f.attributes[oidField]).filter(id => id !== undefined && id !== null));
    } else {
      setCheckedOids([]);
    }
  }, [results, selectedLayerItem]);

  // Load active layers on startup and layer updates
  useEffect(() => {
    if (!mapView || !mapView.map) return;
    
    const updateLayers = () => {
      const list = getAllFeatureLayers(mapView.map);
      setLayersList(list);
    };

    updateLayers();
    const handle = mapView.map.layers.on("change", updateLayers);

    mapView.map.layers.forEach(l => {
      if (!l.loaded) {
        l.load().then(updateLayers).catch(() => {});
      }
    });

    return () => handle.remove();
  }, [mapView]);

  // Clear highlight graphics when unmounting
  useEffect(() => {
    return () => {
      if (mapView && mapView.graphics) {
        mapView.graphics.removeAll();
      }
    };
  }, [mapView]);

  // Helper to query unique values dynamically from layer REST endpoint
  const getFieldUniqueValues = async (layerItem, fieldName) => {
    if (!layerItem || !fieldName) return [];
    const { type, rawLayer } = layerItem;
    
    try {
      if (type === "map-image-sublayer") {
        const parentUrl = layerItem.parentLayer.url;
        const sublayerId = layerItem.sublayerId;
        const queryUrl = `${parentUrl}/${sublayerId}/query`;
        
        const params = new URLSearchParams();
        params.append("f", "json");
        params.append("where", "1=1");
        params.append("outFields", fieldName);
        params.append("returnGeometry", "false");
        params.append("returnDistinctValues", "true");
        
        const proxyUrl = getProxyUrl(queryUrl);
        const res = await fetch(proxyUrl, { method: "POST", body: params });
        const data = await res.json();
        
        if (data && data.features) {
          return data.features
            .map(f => f.attributes[fieldName])
            .filter(v => v !== null && v !== undefined && String(v).trim() !== '');
        }
      } else if (rawLayer) {
        const query = rawLayer.createQuery();
        query.where = "1=1";
        query.outFields = [fieldName];
        query.returnGeometry = false;
        query.returnDistinctValues = true;
        
        const featureSet = await rawLayer.queryFeatures(query);
        if (featureSet && featureSet.features) {
          return featureSet.features
            .map(f => f.attributes[fieldName])
            .filter(v => v !== null && v !== undefined && String(v).trim() !== '');
        }
      }
    } catch (err) {
      console.warn("Failed to query unique values dynamically:", err);
    }
    return [];
  };

  // Helper to load and sort unique values for a specific clause row
  const loadUniqueValuesForClause = async (clauseId, fieldName) => {
    if (!selectedLayerItem || !fieldName) return;
    
    setClauses(prev => prev.map(c => c.id === clauseId ? { ...c, isLoadingValues: true } : c));
    
    try {
      const values = await getFieldUniqueValues(selectedLayerItem, fieldName);
      const uniqueVals = Array.from(new Set(values));
      const sorted = [...uniqueVals].sort((a, b) => {
        if (typeof a === 'number' && typeof b === 'number') return a - b;
        return String(a).localeCompare(String(b));
      });
      
      setClauses(prev => prev.map(c => c.id === clauseId ? { 
        ...c, 
        uniqueValues: sorted, 
        value: sorted.length > 0 ? String(sorted[0]) : '',
        isLoadingValues: false 
      } : c));
    } catch (err) {
      console.error("Failed to load unique values for clause:", err);
      setClauses(prev => prev.map(c => c.id === clauseId ? { 
        ...c, 
        uniqueValues: [], 
        value: '',
        isLoadingValues: false 
      } : c));
    }
  };

  // Load fields dynamically when selected layer changes
  useEffect(() => {
    if (!selectedLayerItem) {
      setFieldsList([]);
      setSelectedFieldName('');
      setClauses([
        { id: '1', logicalOp: 'WHERE', fieldName: '', operator: '=', value: '', customValue: '', uniqueValues: [], isLoadingValues: false }
      ]);
      setResults([]);
      setHasQueried(false);
      setSqlPreview('');
      setRawSqlText('');
      if (mapView && mapView.graphics) {
        mapView.graphics.removeAll();
      }
      return;
    }

    const loadFields = async () => {
      setIsLoadingFields(true);
      
      let actualFields = [];
      try {
        if (selectedLayerItem.rawLayer) {
          if (typeof selectedLayerItem.rawLayer.load === 'function' && !selectedLayerItem.rawLayer.loaded) {
            await selectedLayerItem.rawLayer.load();
          }
          if (selectedLayerItem.rawLayer.fields) {
            actualFields = selectedLayerItem.rawLayer.fields;
          }
        }
      } catch (err) {
        console.warn("Failed to load active layer fields locally:", err);
      }

      // If fields list is empty, try direct sublayer REST query
      if (actualFields.length === 0 && selectedLayerItem.type === "map-image-sublayer") {
        try {
          const parentUrl = selectedLayerItem.parentLayer.url;
          const sublayerId = selectedLayerItem.sublayerId;
          const sublayerUrl = `${parentUrl}/${sublayerId}?f=json`;
          const proxyUrl = getProxyUrl(sublayerUrl);
          const res = await fetch(proxyUrl);
          const data = await res.json();
          if (data && data.fields) {
            actualFields = data.fields;
          }
        } catch (err) {
          console.warn("Failed to fetch sublayer fields metadata via REST:", err);
        }
      }

      // Filter out standard system or non-queryable attributes to present meaningful fields for users
      const systemKeywords = ['objectid', 'fid', 'shape', 'globalid', 'st_area', 'st_length', 'shape.len', 'shape.area', 'uuid', 'rowid', 'created_', 'edited_'];
      const filtered = actualFields.filter(f => {
        const nameLower = f.name.toLowerCase();
        const typeLower = (f.type || '').toLowerCase();
        
        const isSystem = systemKeywords.some(kw => nameLower.includes(kw));
        const isNonSimpleType = typeLower.includes('geometry') || typeLower.includes('oid') || typeLower.includes('blob') || typeLower.includes('raster');
        
        return !isSystem && !isNonSimpleType;
      });

      const fallbackFields = [
        { name: 'Block_Number', alias: isRTL ? 'رقم القسيمة' : 'Block Number', type: 'string' },
        { name: 'Zone_Type', alias: isRTL ? 'نوع المنطقة' : 'Zone Type', type: 'string' },
        { name: 'Ownership', alias: isRTL ? 'الملكية' : 'Ownership', type: 'string' },
        { name: 'Parcel_ID', alias: isRTL ? 'رقم القطعة' : 'Parcel ID', type: 'string' },
        { name: 'Area_sqm', alias: isRTL ? 'المساحة (م٢)' : 'Area (sqm)', type: 'double' }
      ];

      const finalFields = filtered.length > 0 
        ? filtered.map(f => ({ name: f.name, alias: f.alias || f.name, type: f.type || 'string' }))
        : fallbackFields;

      setFieldsList(finalFields);
      setIsLoadingFields(false);

      setSelectedFieldName('');
      setClauses([
        { 
          id: '1', 
          logicalOp: 'WHERE', 
          fieldName: '', 
          operator: '=', 
          value: '',
          uniqueValues: [],
          isLoadingValues: false
        }
      ]);
    };

    loadFields();
  }, [selectedLayerId, selectedLayerItem]);

  const hasNoValueInput = (op) => op === 'IS NULL' || op === 'IS NOT NULL';

  // Construct SQL preview dynamically from multi-clause configuration
  const compileClausesToSql = (clauseList) => {
    if (clauseList.length === 0) return "";
    
    let sql = "";
    clauseList.forEach((c, idx) => {
      if (!c.fieldName) return;
      
      const fieldItem = fieldsList.find(f => f.name === c.fieldName);
      const isString = fieldItem?.type === 'string' || fieldItem?.type === 'esriFieldTypeString';
      const isDate = fieldItem?.type === 'date' || fieldItem?.type === 'esriFieldTypeDate';
      
      const chosenVal = c.value.trim();
      const op = c.operator;
      
      let expr = "";
      if (op === 'IS NULL' || op === 'IS NOT NULL') {
        expr = `${c.fieldName} ${op}`;
      } else if (op === 'LIKE' || op === 'CONTAINS') {
        expr = `${c.fieldName} LIKE '%${chosenVal}%'`;
      } else if (op === 'NOT LIKE') {
        expr = `${c.fieldName} NOT LIKE '%${chosenVal}%'`;
      } else if (op === 'STARTS WITH') {
        expr = `${c.fieldName} LIKE '${chosenVal}%'`;
      } else if (op === 'ENDS WITH') {
        expr = `${c.fieldName} LIKE '%${chosenVal}'`;
      } else if (op === 'IN' || op === 'NOT IN' || op === 'INCLUDE' || op === 'NOT INCLUDE') {
        const parts = chosenVal.split(',').map(p => p.trim()).filter(Boolean);
        const formatted = parts.map(p => isString ? `'${p}'` : p).join(', ');
        const sqlOp = (op === 'INCLUDE' || op === 'IN') ? 'IN' : 'NOT IN';
        expr = `${c.fieldName} ${sqlOp} (${formatted})`;
      } else if (op === 'BETWEEN' || op === 'NOT BETWEEN') {
        const parts = chosenVal.split(' AND ').map(p => p.trim());
        const minVal = parts[0] || '';
        const maxVal = parts[1] || '';
        
        let formattedMin = minVal;
        let formattedMax = maxVal;
        
        if (isString) {
          formattedMin = `'${minVal}'`;
          formattedMax = `'${maxVal}'`;
        } else if (isDate) {
          formattedMin = `DATE '${minVal}'`;
          formattedMax = `DATE '${maxVal}'`;
        }
        
        expr = `${c.fieldName} ${op} ${formattedMin} AND ${formattedMax}`;
      } else {
        let formattedVal = chosenVal;
        if (isString) {
          formattedVal = `'${chosenVal}'`;
        } else if (isDate) {
          formattedVal = `DATE '${chosenVal}'`;
        }
        expr = `${c.fieldName} ${op} ${formattedVal}`;
      }
      
      if (idx === 0) {
        sql += expr;
      } else {
        sql += ` ${c.logicalOp} ${expr}`;
      }
    });
    
    return sql;
  };

  // Sync clauses with rawSqlText & sqlPreview
  useEffect(() => {
    if (!sqlCodeMode) {
      const compiled = compileClausesToSql(clauses);
      setRawSqlText(compiled);
      setSqlPreview(compiled);
    }
  }, [clauses, sqlCodeMode, fieldsList]);

  // Update specific clause item and query unique values if field changes
  const handleUpdateClause = (clauseId, fieldsToUpdate) => {
    setClauses(prev => prev.map(c => {
      if (c.id === clauseId) {
        let updated = { ...c, ...fieldsToUpdate };
        if (fieldsToUpdate.fieldName !== undefined && fieldsToUpdate.fieldName !== c.fieldName) {
          const fieldItem = fieldsList.find(f => f.name === fieldsToUpdate.fieldName);
          const category = getFieldCategory(fieldItem?.type);
          const allowedOps = OPERATORS_BY_CATEGORY[category] || OPERATORS_BY_CATEGORY.text;
          
          updated.operator = allowedOps[0]?.id || '=';
          updated.value = '';
          loadUniqueValuesForClause(clauseId, fieldsToUpdate.fieldName);
        }
        if (fieldsToUpdate.operator !== undefined && fieldsToUpdate.operator !== c.operator) {
          updated.value = '';
        }
        return updated;
      }
      return c;
    }));
  };

  const handleAddClauseRow = () => {
    const nextField = '';
    const newId = Date.now().toString();
    setClauses(prev => [
      ...prev,
      { 
        id: newId, 
        logicalOp: 'AND', 
        fieldName: nextField, 
        operator: '=', 
        value: '',
        uniqueValues: [],
        isLoadingValues: false
      }
    ]);
  };

  const handleDeleteClauseRow = (clauseId) => {
    setClauses(prev => prev.filter(c => c.id !== clauseId));
  };

  // Helpers to combine / subtract / subset selection features
  const getFeatureOid = (feat) => {
    const oidField = selectedLayerItem?.rawLayer?.objectIdField || 'OBJECTID';
    return feat.attributes[oidField];
  };

  const combineFeatures = (current, incoming) => {
    const map = new Map();
    current.forEach(f => map.set(getFeatureOid(f), f));
    incoming.forEach(f => map.set(getFeatureOid(f), f));
    return Array.from(map.values());
  };

  const subtractFeatures = (current, incoming) => {
    const incomingOids = new Set(incoming.map(f => getFeatureOid(f)));
    return current.filter(f => !incomingOids.has(getFeatureOid(f)));
  };

  const subsetFeatures = (current, incoming) => {
    const incomingOids = new Set(incoming.map(f => getFeatureOid(f)));
    return current.filter(f => incomingOids.has(getFeatureOid(f)));
  };

  // Execute advanced query based on Selection Type
  const handleApplyQuery = async () => {
    if (!selectedLayerItem || !activeSqlExpression.trim()) return;
    setIsQuerying(true);
    setHasQueried(true);
    setHighlightedFeatureId(null);

    let queryResults = [];
    const { type, rawLayer } = selectedLayerItem;
    
    // Debug logging pre-execution
    console.log("=== GIS ADVANCED QUERY VERIFICATION LOG ===");
    console.log("Selected Layer:", selectedLayerItem.title || selectedLayerItem.name);
    console.log("Generated SQL:", activeSqlExpression);
    
    try {
      if (type === "map-image-sublayer") {
        const parentUrl = selectedLayerItem.parentLayer.url;
        const sublayerId = selectedLayerItem.sublayerId;
        const queryUrl = `${parentUrl}/${sublayerId}/query`;
        console.log("Query URL:", queryUrl);
        
        const params = new URLSearchParams();
        params.append("f", "json");
        params.append("where", activeSqlExpression);
        params.append("outFields", "*");
        params.append("returnGeometry", "true");
        params.append("outSR", JSON.stringify(mapView.spatialReference));
        
        const proxyUrl = getProxyUrl(queryUrl);
        const res = await fetch(proxyUrl, { method: "POST", body: params });
        const data = await res.json();
        
        if (data && data.features) {
          const sr = data.spatialReference || mapView.spatialReference;
          const restGeomType = data.geometryType || selectedLayerItem.geometryType || '';
          let typeString = "";
          const geomLower = restGeomType.toLowerCase();
          
          if (geomLower.includes("polygon")) {
            typeString = "polygon";
          } else if (geomLower.includes("polyline") || geomLower.includes("line")) {
            typeString = "polyline";
          } else if (geomLower.includes("multipoint")) {
            typeString = "multipoint";
          } else if (geomLower.includes("point")) {
            typeString = "point";
          }

          queryResults = data.features.map(f => {
            if (f.geometry) {
              f.geometry.spatialReference = sr;
              if (typeString) {
                f.geometry.type = typeString;
              }
            }
            return new Graphic({
              geometry: f.geometry,
              attributes: f.attributes
            });
          });
        }
      } else {
        const queryUrl = rawLayer.url;
        console.log("Query URL:", queryUrl);

        const query = rawLayer.createQuery();
        query.where = activeSqlExpression;
        query.outFields = ["*"];
        query.returnGeometry = true;
        query.outSpatialReference = mapView.spatialReference;
        
        const featureSet = await rawLayer.queryFeatures(query);
        if (featureSet && featureSet.features) {
          queryResults = featureSet.features;
        }
      }
      console.log("Returned Feature Count:", queryResults.length);
    } catch (err) {
      console.error("Query Errors:", err);
    }
    console.log("=========================================");

    // Compute updated selection based on Selection Type
    let nextSelection = [];
    if (selectionType === 'NEW') {
      nextSelection = queryResults;
    } else if (selectionType === 'ADD') {
      nextSelection = combineFeatures(results, queryResults);
    } else if (selectionType === 'REMOVE') {
      nextSelection = subtractFeatures(results, queryResults);
    } else if (selectionType === 'SUBSET') {
      nextSelection = subsetFeatures(results, queryResults);
    }

    setResults(nextSelection);
    mapView.graphics.removeAll();

    // Redraw clear, highly visible selection highlights for all matched features
    nextSelection.forEach(feature => {
      if (!feature.geometry) return;
      
      let symbol = null;
      const geomType = feature.geometry.type || selectedLayerItem.geometryType || '';
      const geomLower = geomType.toLowerCase();

      if (geomLower.includes('point') && !geomLower.includes('multipoint')) {
        symbol = {
          type: "simple-marker",
          style: "circle",
          color: [223, 38, 28, 0.4],
          size: 16,
          outline: { color: [223, 38, 28, 1.0], width: 2 }
        };
      } else if (geomLower.includes('polyline') || geomLower.includes('line')) {
        symbol = {
          type: "simple-line",
          color: [223, 38, 28, 0.8],
          width: 3.5,
          style: "solid"
        };
      } else {
        symbol = {
          type: "simple-fill",
          color: [223, 38, 28, 0.2],
          outline: { color: [223, 38, 28, 0.8], width: 2.5, style: "solid" }
        };
      }

      const selectionGraphic = new Graphic({
        geometry: feature.geometry,
        symbol: symbol
      });
      mapView.graphics.add(selectionGraphic);
    });

    // Zoom collectively to selections and auto-open popup/flash if exactly 1 result returned
    if (nextSelection.length > 0) {
      const geometries = nextSelection.map(f => f.geometry).filter(Boolean);
      if (geometries.length > 0) {
        if (geometries.length === 1) {
          const feature = nextSelection[0];
          
          // Flash animation for the single result
          const geomLower = (feature.geometry.type || selectedLayerItem.geometryType || '').toLowerCase();
          const flashSymbol = geomLower.includes('point') && !geomLower.includes('multipoint')
            ? {
                type: "simple-marker",
                style: "circle",
                color: [223, 38, 28, 0.8],
                size: 24,
                outline: { color: "#ffffff", width: 2 }
              }
            : geomLower.includes('polyline') || geomLower.includes('line')
            ? {
                type: "simple-line",
                color: [223, 38, 28, 1.0],
                width: 6,
                style: "solid"
              }
            : {
                type: "simple-fill",
                color: [223, 38, 28, 0.4],
                outline: { color: "#df261c", width: 4, style: "solid" }
              };

          const flashGraphic = new Graphic({
            geometry: feature.geometry,
            symbol: flashSymbol
          });

          mapView.graphics.add(flashGraphic);
          let flashCount = 0;
          const interval = setInterval(() => {
            flashGraphic.visible = !flashGraphic.visible;
            flashCount++;
            if (flashCount >= 6) {
              clearInterval(interval);
              mapView.graphics.remove(flashGraphic);
            }
          }, 150);

          // Zoom to feature with comfortable extent context or padded point zoom
          if (isValidBahrainGeometry(feature.geometry, mapView)) {
            const isPoint = feature.geometry.type === 'point';
            const goToParams = isPoint 
              ? { target: feature.geometry, zoom: 12 } 
              : (feature.geometry.extent ? feature.geometry.extent.expand(2.5) : feature.geometry);
            
            mapView.goTo(goToParams, { duration: 1000 }).catch(err => {
              console.warn("Auto zoom failed:", err);
            });
          }
        } else {
          // Zoom to all selected graphics collectively
          const validSelection = nextSelection.filter(f => isValidBahrainGeometry(f.geometry, mapView));
          if (validSelection.length > 0) {
            mapView.goTo(validSelection).catch(err => {
              console.warn("mapView.goTo collective graphics zoom failed:", err);
            });
          }
        }
      }
    }

    // Apply strict visual filters on the Map Layer
    try {
      const oidField = selectedLayerItem.rawLayer.objectIdField || 'OBJECTID';
      const oids = nextSelection.map(f => f.attributes[oidField]).filter(Boolean);
      let filterExpression = "1=2";
      if (oids.length > 0) {
        filterExpression = `${oidField} IN (${oids.join(',')})`;
      }

      if (type === "map-image-sublayer") {
        selectedLayerItem.rawLayer.definitionExpression = filterExpression;
      } else {
        const layerView = await mapView.whenLayerView(rawLayer);
        if (layerView) {
          layerView.filter = { where: filterExpression };
          if (typeof layerView.refresh === 'function') {
            layerView.refresh();
          }
        }
      }

      // Apply standard layerView highlight handle for FeatureLayers
      if (highlightHandleRef.current) {
        highlightHandleRef.current.remove();
        highlightHandleRef.current = null;
      }
      if (type !== "map-image-sublayer") {
        const layerView = await mapView.whenLayerView(rawLayer);
        if (layerView && typeof layerView.highlight === 'function') {
          highlightHandleRef.current = layerView.highlight(nextSelection);
        }
      }
    } catch (err) {
      console.warn("Applying visual map filter or highlight failed:", err);
    }

    setIsQuerying(false);
    setStep(3);
  };

  // Temporary Analysis Layer helpers
  const getLayerNameForFeature = (feature, index) => {
    const key = getFeatureKey(feature, index);
    if (customNames[key]) {
      return customNames[key];
    }
    const attrs = feature.attributes || {};
    const oidField = selectedLayerItem?.rawLayer?.objectIdField || 'OBJECTID';
    const oid = attrs[oidField] || (index + 1);

    const candidates = ['governorate', 'name', 'title', 'label', 'block_no', 'block'];
    for (const key of candidates) {
      const actualKey = Object.keys(attrs).find(k => k.toLowerCase() === key);
      if (actualKey && attrs[actualKey]) {
        const val = attrs[actualKey];
        if (key === 'governorate') {
          if (typeof val === 'string' && val.toLowerCase() === 'capital') {
            return `Selected Feature - Capital`;
          }
          return `Governorate_ID_${oid}`;
        }
        return `Selected Feature - ${val}`;
      }
    }
    return `Query Result - ${String(oid).padStart(3, '0')}`;
  };

  const handleAddLayer = async (featuresToAdd, layerName) => {
    if (!mapView || !featuresToAdd || featuresToAdd.length === 0) return;

    try {
      const FeatureLayerModule = await import('@arcgis/core/layers/FeatureLayer');
      const FeatureLayer = FeatureLayerModule.default || FeatureLayerModule;
      const SpatialReferenceModule = await import('@arcgis/core/geometry/SpatialReference');
      const SpatialReference = SpatialReferenceModule.default || SpatialReferenceModule;
      
      const mapSR = mapView.spatialReference;
      const geomType = featuresToAdd[0].geometry?.type || 'point';

      // Pick a color
      const LAYER_COLORS = [
        [30, 60, 114],   // Blue
        [16, 185, 129],  // Emerald Green
        [245, 158, 11],  // Amber Yellow
        [139, 92, 246],  // Purple
        [223, 38, 28],   // Red
        [236, 72, 153],  // Pink
        [6, 182, 212],   // Cyan
        [100, 116, 139]  // Slate
      ];
      const color = LAYER_COLORS[Math.floor(Math.random() * LAYER_COLORS.length)];

      const symbol = {
        point: {
          type: 'simple-marker',
          color: color,
          outline: { color: [255, 255, 255], width: 1 },
          size: 9
        },
        polyline: {
          type: 'simple-line',
          color: color,
          width: 2.5
        },
        polygon: {
          type: 'simple-fill',
          color: [...color, 0.4],
          outline: { color: color, width: 1.5 }
        }
      }[geomType] || {
        type: 'simple-marker',
        color: color,
        size: 8
      };

      // Extract attributes and fields
      const sampleAttrs = featuresToAdd[0].attributes || {};
      const fields = [
        { name: "ObjectID", alias: "ObjectID", type: "oid" }
      ];
      Object.keys(sampleAttrs).forEach(key => {
        if (key !== "ObjectID") {
          let type = "string";
          if (typeof sampleAttrs[key] === 'number') {
            type = "double";
          }
          fields.push({ name: key, alias: key, type: type });
        }
      });

      const graphics = featuresToAdd.map((f, idx) => {
        const attrs = { ...f.attributes };
        if (attrs.ObjectID === undefined || attrs.ObjectID === null) {
          attrs.ObjectID = idx + 1;
        }
        return new Graphic({
          geometry: f.geometry,
          attributes: attrs
        });
      });

      const childLayerId = `uploaded-geojson-child-${(typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2)}`;
      const parentId = `uploaded-geojson-parent-${(typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2)}`;

      const layer = new FeatureLayer({
        id: childLayerId,
        title: layerName,
        source: graphics,
        geometryType: geomType,
        objectIdField: "ObjectID",
        fields: fields,
        renderer: {
          type: 'simple',
          symbol
        },
        spatialReference: mapSR,
        visible: false
      });

      mapView.map.add(layer);
      mapView.map.reorder(layer, mapView.map.layers.length - 1);

      // Register layer order and visibility
      if (setLayerOrder) setLayerOrder(prev => [childLayerId, ...prev]);
      if (setLayerVisibility) setLayerVisibility(prev => ({ ...prev, [childLayerId]: false, [parentId]: false }));

      const childObj = {
        id: childLayerId,
        name: layerName,
        visible: false,
        layer,
        color,
        geometryType: geomType,
        featureCount: featuresToAdd.length
      };

      const resultObj = {
        id: parentId,
        name: layerName,
        date: new Date().toLocaleString(),
        featureCount: featuresToAdd.length,
        visible: false,
        type: 'multi-file',
        children: [childObj]
      };

      if (setAddDataResults) {
        setAddDataResults(prev => [resultObj, ...prev]);
      }

      showToast(isRTL ? "تمت إضافة المعلم كطبقة تحليل بنجاح." : "Feature successfully added as analysis layer.");
    } catch (err) {
      console.error("Failed to add temporary analysis layer:", err);
      showToast(isRTL ? "فشل في إضافة الطبقة." : "Failed to add layer.");
    }
  };

  const isFeatureAdded = (feature, idx) => {
    if (!mapView || !mapView.map) return false;
    const layerName = getLayerNameForFeature(feature, idx);
    return mapView.map.layers.some(l => l.title === layerName);
  };

  const isBulkAdded = () => {
    if (!mapView || !mapView.map || checkedOids.length === 0) return false;
    if (mergeSelected) {
      const mergedName = `${selectedLayerItem?.title || 'Query Result'} - Merged`;
      return mapView.map.layers.some(l => l.title === mergedName);
    } else {
      const oidField = selectedLayerItem?.rawLayer?.objectIdField || 'OBJECTID';
      const selectedFeatures = results.filter(f => checkedOids.includes(f.attributes[oidField]));
      if (selectedFeatures.length === 0) return false;
      return selectedFeatures.every((feat) => {
        const idx = results.indexOf(feat);
        const layerName = getLayerNameForFeature(feat, idx);
        return mapView.map.layers.some(l => l.title === layerName);
      });
    }
  };

  const handleAddSingleFeature = async (feature, idx) => {
    // Prevent duplicate addition if it's already added
    if (isFeatureAdded(feature, idx)) return;
    const layerName = getLayerNameForFeature(feature, idx);
    await handleAddLayer([feature], layerName);
  };

  const handleAddSelectedFeatures = async () => {
    const oidField = selectedLayerItem?.rawLayer?.objectIdField || 'OBJECTID';
    const selectedFeatures = results.filter(f => checkedOids.includes(f.attributes[oidField]));
    
    if (selectedFeatures.length === 0) {
      showToast(isRTL ? "الرجاء اختيار ميزات أولاً." : "Please select features first.");
      return;
    }

    if (mergeSelected) {
      const mergedName = `${selectedLayerItem?.title || 'Query Result'} - Merged`;
      await handleAddLayer(selectedFeatures, mergedName);
    } else {
      // Create separate layers
      for (let i = 0; i < selectedFeatures.length; i++) {
        const feat = selectedFeatures[i];
        const layerName = getLayerNameForFeature(feat, i);
        await handleAddLayer([feat], layerName);
      }
    }
  };

  // Zoom & highlight helper
  const handleFeatureClick = async (feature) => {
    if (!mapView || !feature.geometry) return;

    // Show the added layer on Zoom To
    const idx = results.indexOf(feature);
    const layerName = getLayerNameForFeature(feature, idx);
    const mergedName = `${selectedLayerItem?.title || 'Query Result'} - Merged`;
    if (mapView.map && mapView.map.layers) {
      mapView.map.layers.forEach(l => {
        if (l.title === layerName || l.title === mergedName) {
          l.visible = true;
          if (setLayerVisibility) {
            setLayerVisibility(prev => ({ ...prev, [l.id]: true }));
          }
        }
      });
    }
    
    const oidField = selectedLayerItem.rawLayer.objectIdField || 'OBJECTID';
    const oid = feature.attributes[oidField];
    setHighlightedFeatureId(oid);

    mapView.graphics.removeAll();

    // Apply standard layerView highlight for clicked feature
    try {
      if (highlightHandleRef.current) {
        highlightHandleRef.current.remove();
        highlightHandleRef.current = null;
      }
      
      if (selectedLayerItem.type !== "map-image-sublayer") {
        const layerView = await mapView.whenLayerView(selectedLayerItem.rawLayer);
        if (layerView && typeof layerView.highlight === 'function') {
          highlightHandleRef.current = layerView.highlight(feature);
        }
      }
    } catch (err) {
      console.warn("Failed to apply click layerView highlight:", err);
    }

    results.forEach(f => {
      if (!f.geometry) return;
      const fOid = f.attributes[oidField];
      const isClicked = fOid === oid;
      
      let symbol = null;
      const geomType = f.geometry.type || selectedLayerItem.geometryType || '';
      const geomLower = geomType.toLowerCase();

      if (isClicked) {
        if (geomLower.includes('point') && !geomLower.includes('multipoint')) {
          symbol = {
            type: "simple-marker",
            style: "circle",
            color: [223, 38, 28, 0.5],
            size: 16,
            outline: { color: [223, 38, 28, 1.0], width: 2.5 }
          };
        } else if (geomLower.includes('polyline') || geomLower.includes('line')) {
          symbol = {
            type: "simple-line",
            color: [223, 38, 28, 1.0],
            width: 4.5,
            style: "solid"
          };
        } else {
          symbol = {
            type: "simple-fill",
            color: [223, 38, 28, 0.3],
            outline: { color: [223, 38, 28, 1.0], width: 3, style: "solid" }
          };
        }
      } else {
        if (geomLower.includes('point') && !geomLower.includes('multipoint')) {
          symbol = {
            type: "simple-marker",
            style: "circle",
            color: [223, 38, 28, 0.25],
            size: 14,
            outline: { color: [223, 38, 28, 0.7], width: 1.5 }
          };
        } else if (geomLower.includes('polyline') || geomLower.includes('line')) {
          symbol = {
            type: "simple-line",
            color: [223, 38, 28, 0.7],
            width: 3.0,
            style: "solid"
          };
        } else {
          symbol = {
            type: "simple-fill",
            color: [223, 38, 28, 0.15],
            outline: { color: [223, 38, 28, 0.7], width: 2.0, style: "solid" }
          };
        }
      }

      const selectionGraphic = new Graphic({
        geometry: f.geometry,
        symbol: symbol
      });
      mapView.graphics.add(selectionGraphic);
    });

    // Pulse-flash glowing animation for clicked feature row
    const geomLower = (feature.geometry.type || selectedLayerItem.geometryType || '').toLowerCase();
    const flashSymbol = geomLower.includes('point') && !geomLower.includes('multipoint')
      ? {
          type: "simple-marker",
          style: "circle",
          color: [223, 38, 28, 0.8],
          size: 24,
          outline: { color: "#ffffff", width: 2 }
        }
      : geomLower.includes('polyline') || geomLower.includes('line')
      ? {
          type: "simple-line",
          color: [223, 38, 28, 1.0],
          width: 6,
          style: "solid"
        }
      : {
          type: "simple-fill",
          color: [223, 38, 28, 0.4],
          outline: { color: "#df261c", width: 4, style: "solid" }
        };

    const flashGraphic = new Graphic({
      geometry: feature.geometry,
      symbol: flashSymbol
    });

    mapView.graphics.add(flashGraphic);
    let flashCount = 0;
    const interval = setInterval(() => {
      flashGraphic.visible = !flashGraphic.visible;
      flashCount++;
      if (flashCount >= 6) {
        clearInterval(interval);
        mapView.graphics.remove(flashGraphic);
      }
    }, 150);

    if (isValidBahrainGeometry(feature.geometry, mapView)) {
      const isPoint = feature.geometry.type === 'point';
      const goToParams = isPoint 
        ? { target: feature.geometry, zoom: 12 } 
        : (feature.geometry.extent ? feature.geometry.extent.expand(2.5) : feature.geometry);

      mapView.goTo(goToParams, { duration: 800 }).catch(err => {
        console.warn("mapView.goTo failed:", err);
      });
    }
  };

  // Reset filter and map state
  const handleResetQuery = async () => {
    if (highlightHandleRef.current) {
      highlightHandleRef.current.remove();
      highlightHandleRef.current = null;
    }

    setClauses([
      { 
        id: '1', 
        logicalOp: 'WHERE', 
        fieldName: '', 
        operator: '=', 
        value: ''
      }
    ]);
    setResults([]);
    setHasQueried(false);
    setSqlPreview('');
    setRawSqlText('');
    setHighlightedFeatureId(null);
    if (mapView && mapView.graphics) {
      mapView.graphics.removeAll();
    }

    if (!selectedLayerItem) return;
    const { type, rawLayer } = selectedLayerItem;
    
    try {
      if (type === "map-image-sublayer") {
        selectedLayerItem.rawLayer.definitionExpression = null;
      } else {
        const layerView = await mapView.whenLayerView(rawLayer);
        if (layerView) {
          layerView.filter = null;
          if (typeof layerView.refresh === 'function') {
            layerView.refresh();
          }
        }
      }
    } catch (e) {
      console.warn("Reset layer filter failed:", e);
    }
  };

  // Clear visual highlights and selection list
  const handleClearSelection = async () => {
    if (highlightHandleRef.current) {
      highlightHandleRef.current.remove();
      highlightHandleRef.current = null;
    }

    setResults([]);
    setHasQueried(false);
    setHighlightedFeatureId(null);
    if (mapView && mapView.graphics) {
      mapView.graphics.removeAll();
    }

    if (!selectedLayerItem) return;
    const { type, rawLayer } = selectedLayerItem;
    
    try {
      if (type === "map-image-sublayer") {
        selectedLayerItem.rawLayer.definitionExpression = null;
      } else {
        const layerView = await mapView.whenLayerView(rawLayer);
        if (layerView) {
          layerView.filter = null;
          if (typeof layerView.refresh === 'function') {
            layerView.refresh();
          }
        }
      }
    } catch (e) {
      console.warn("Clear selection filter failed:", e);
    }
  };

  // Get label preview helper
  const getFeatureLabel = (feature, index) => {
    if (!feature) return 'Feature';
    const key = getFeatureKey(feature, index);
    if (customNames[key]) {
      return customNames[key];
    }
    if (!feature.attributes) return 'Feature';
    const attrs = feature.attributes;
    
    const candidates = ['name', 'title', 'label', 'governorate', 'block_no', 'survey_year', 'block', 'id'];
    for (const key of Object.keys(attrs)) {
      const lowerKey = key.toLowerCase();
      if (candidates.some(c => lowerKey === c)) {
        return `${key}: ${attrs[key]}`;
      }
    }
    const oidField = selectedLayerItem?.rawLayer?.objectIdField || 'OBJECTID';
    return `ID: ${attrs[oidField] || Object.values(attrs)[0]}`;
  };

  return (
    <div className={`advanced-query-panel-container ${isRTL ? 'rtl' : 'ltr'}`} style={{ overflow: 'hidden' }}>
      <div className="aq-wizard-container" style={{
        display: 'flex',
        width: '300%',
        height: '100%',
        transition: 'transform 0.3s ease-in-out',
        transform: `translateX(${
          step === 1 
            ? '0%' 
            : step === 2 
            ? (isRTL ? '33.333%' : '-33.333%') 
            : (isRTL ? '66.666%' : '-66.666%')
        })`
      }}>
        
        {/* SCREEN 1: Default Layer & Selection Type view */}
        <div className="aq-wizard-step" style={{ width: '33.333%', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
          <div style={{ flex: 1, padding: '0px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
            
            {/* Layer Selection */}
            <div className="aq-section">
              <label className="aq-label">{isRTL ? 'اختر الطبقة' : 'Select Layer'}</label>
              <TreeSelect 
                treeData={builtTreeData}
                value={selectedLayerId}
                onChange={(val) => {
                  setSelectedLayerId(val);
                  if (!val) {
                    setSelectionType('');
                  }
                  if (val && selectionType) {
                    setStep(2);
                  }
                }}
                placeholder={isRTL ? 'اختر طبقة للاستعلام...' : 'Select a layer to query...'}
              />
            </div>

            {/* Selection Type */}
            <div className="aq-section aq-selection-type-container">
              <label className="aq-label">{isRTL ? 'نوع التحديد' : 'Selection Type'}</label>
              <CustomSelect 
                options={SELECTION_TYPES.map(s => ({
                  id: s.id,
                  title: isRTL ? s.titleAr : s.titleEn
                }))}
                value={selectionType}
                onChange={(val) => {
                  setSelectionType(val);
                  if (selectedLayerId && val) {
                    setStep(2);
                  }
                }}
                placeholder={isRTL ? 'اختر نوع التحديد...' : 'Select selection type...'}
                disabled={!selectedLayerItem}
              />
            </div>

          </div>
        </div>

        {/* SCREEN 2: Query Builder form */}
        <div className="aq-wizard-step" style={{ width: '33.333%', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', borderLeft: isRTL ? 'none' : '1px solid #f1f5f9', borderRight: isRTL ? '1px solid #f1f5f9' : 'none' }}>
          
          {/* Query Builder Header with Back Button and Aligned SQL Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0px', borderBottom: 'none', background: 'none', flexShrink: 0, marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button 
                onClick={() => setStep(1)} 
                type="button" 
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: '#1a2f4d', 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  padding: '6px',
                  borderRadius: '6px',
                  transition: 'background-color 0.2s'
                }}
                className="aq-header-back-btn"
              >
                {isRTL ? <ArrowRight size={18} style={{ color: '#df261c' }} /> : <ArrowLeft size={18} style={{ color: '#df261c' }} />}
              </button>
              
              <span style={{ fontWeight: 700, fontSize: '15px', color: '#1a2f4d' }}>
                {isRTL ? 'منشئ الاستعلام' : 'Query Builder'}
              </span>
            </div>

            {/* SQL Toggle right aligned */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="aq-sublabel" style={{ margin: 0, fontWeight: 600 }}>SQL</span>
              <button 
                className={`aq-toggle-btn ${sqlCodeMode ? 'active' : ''}`}
                onClick={() => setSqlCodeMode(!sqlCodeMode)}
                type="button"
              >
                <div className="aq-toggle-slider" />
              </button>
            </div>
          </div>

          {/* Scrollable content of Query Builder Screen */}
          <div style={{ flex: 1, padding: '0px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }} className="aq-scrollable-content">
            
            {sqlCodeMode ? (
              /* RAW SQL mode */
              <div className="aq-field-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="aq-sublabel">{isRTL ? 'صيغة استعلام SQL المباشرة' : 'SQL Expression'}</label>
                <textarea
                  className="aq-sql-textarea"
                  value={rawSqlText}
                  onChange={(e) => {
                    setRawSqlText(e.target.value);
                    setSqlPreview(e.target.value);
                  }}
                  placeholder={isRTL ? 'أدخل صيغة الاستعلام، مثال: Governorate = \'Al-Jahra\'' : 'e.g. Governorate = \'Al-Jahra\''}
                />
                {validationError && (
                  <div style={{ color: '#ef4444', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                    <AlertTriangle size={12} />
                    <span>{validationError}</span>
                  </div>
                )}
              </div>
            ) : (
              /* Clause Builder mode starting directly with WHERE / Logical Op */
              <div className="aq-clauses-list" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {clauses.map((clause, idx) => (
                  <div key={clause.id} className="aq-clause-row animate-fade-in" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative', zIndex: 100 - idx }}>
                    <div className="aq-clause-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      {idx === 0 ? (
                        <span className="aq-clause-label" style={{ fontWeight: 700, fontSize: '13px', color: '#1e3c72' }}>{isRTL ? 'WHERE (حيث)' : 'WHERE'}</span>
                      ) : (
                        <div style={{ width: '90px' }}>
                          <CustomSelect
                            options={[
                              { id: 'AND', title: 'AND' },
                              { id: 'OR', title: 'OR' }
                            ]}
                            value={clause.logicalOp}
                            onChange={(val) => handleUpdateClause(clause.id, { logicalOp: val })}
                          />
                        </div>
                      )}

                      {idx > 0 && (
                        <button 
                          className="aq-clause-delete-btn"
                          onClick={() => handleDeleteClauseRow(clause.id)}
                          type="button"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '4px',
                            borderRadius: '4px',
                            transition: 'color 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.color = '#dc2626'}
                          onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>

                    <div className="aq-clause-controls-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 1.2fr', gap: '8px', alignItems: 'end' }}>
                      <div className="aq-field-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label className="aq-sublabel" style={{ fontSize: '11px', fontWeight: 600 }}>{isRTL ? 'الحقل' : 'Field'}</label>
                        <CustomSelect 
                          options={fieldsList.map(f => ({
                            id: f.name,
                            title: f.alias || f.name
                          }))}
                          value={clause.fieldName}
                          onChange={(val) => handleUpdateClause(clause.id, { fieldName: val })}
                          placeholder={isRTL ? 'اختر الحقل' : 'Select Field'}
                        />
                      </div>

                      <div className="aq-field-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label className="aq-sublabel" style={{ fontSize: '11px', fontWeight: 600 }}>{isRTL ? 'المعامل' : 'Operator'}</label>
                        <CustomSelect 
                          options={(() => {
                            const fieldItem = fieldsList.find(f => f.name === clause.fieldName);
                            const category = getFieldCategory(fieldItem?.type);
                            const allowedOps = OPERATORS_BY_CATEGORY[category] || OPERATORS_BY_CATEGORY.text;
                            return allowedOps.map(o => ({ id: o.id, title: o.label }));
                          })()}
                          value={clause.operator}
                          onChange={(val) => handleUpdateClause(clause.id, { operator: val })}
                          placeholder="="
                        />
                      </div>

                      <div className="aq-field-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label className="aq-sublabel" style={{ fontSize: '11px', fontWeight: 600 }}>{isRTL ? 'القيمة' : 'Value'}</label>
                        {(() => {
                          if (clause.isLoadingValues) {
                            return (
                              <div style={{ height: '36px', display: 'flex', alignItems: 'center', padding: '0 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', color: '#64748b', background: '#f8fafc', boxSizing: 'border-box' }}>
                                {isRTL ? 'جاري التحميل...' : 'Loading...'}
                              </div>
                            );
                          }

                          const fieldItem = fieldsList.find(f => f.name === clause.fieldName);
                          const category = getFieldCategory(fieldItem?.type);
                          const op = clause.operator;
                          
                          const isMultiSelect = ['IN', 'NOT IN', 'INCLUDE', 'NOT INCLUDE'].includes(op);
                          const isRange = ['BETWEEN', 'NOT BETWEEN'].includes(op);
                          const isNullCheck = ['IS NULL', 'IS NOT NULL'].includes(op);
                          const isTextSearch = ['LIKE', 'NOT LIKE', 'CONTAINS', 'STARTS WITH', 'ENDS WITH'].includes(op);

                          if (isNullCheck) {
                            return (
                              <div style={{ height: '36px', display: 'flex', alignItems: 'center', padding: '0 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', color: '#94a3b8', background: '#f8fafc', boxSizing: 'border-box' }}>
                                {isRTL ? 'لا توجد قيمة مطلوبة' : 'No value required'}
                              </div>
                            );
                          }

                          if (isRange) {
                            const rangeParts = clause.value.split(' AND ');
                            const minVal = rangeParts[0] || '';
                            const maxVal = rangeParts[1] || '';
                            
                            if (category === 'date') {
                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <input 
                                    type="date"
                                    className="aq-input-text"
                                    value={minVal}
                                    onChange={(e) => handleUpdateClause(clause.id, { value: `${e.target.value} AND ${maxVal}` })}
                                    style={{ height: '36px', boxSizing: 'border-box', padding: '0 8px' }}
                                  />
                                  <input 
                                    type="date"
                                    className="aq-input-text"
                                    value={maxVal}
                                    onChange={(e) => handleUpdateClause(clause.id, { value: `${minVal} AND ${e.target.value}` })}
                                    style={{ height: '36px', boxSizing: 'border-box', padding: '0 8px' }}
                                  />
                                </div>
                              );
                            }
                            
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <input 
                                  type="number"
                                  className="aq-input-text"
                                  placeholder={isRTL ? 'الحد الأدنى...' : 'Min...'}
                                  value={minVal}
                                  onChange={(e) => handleUpdateClause(clause.id, { value: `${e.target.value} AND ${maxVal}` })}
                                  style={{ height: '36px', boxSizing: 'border-box', padding: '0 8px' }}
                                />
                                <input 
                                  type="number"
                                  className="aq-input-text"
                                  placeholder={isRTL ? 'الحد الأقصى...' : 'Max...'}
                                  value={maxVal}
                                  onChange={(e) => handleUpdateClause(clause.id, { value: `${minVal} AND ${e.target.value}` })}
                                  style={{ height: '36px', boxSizing: 'border-box', padding: '0 8px' }}
                                />
                              </div>
                            );
                          }

                          if (isMultiSelect) {
                            if (clause.uniqueValues && clause.uniqueValues.length > 0) {
                              return (
                                <CustomSelect 
                                  options={clause.uniqueValues.map(v => ({ id: String(v), title: String(v) }))}
                                  value={clause.value ? clause.value.split(', ') : []}
                                  onChange={(vals) => handleUpdateClause(clause.id, { value: vals.join(', ') })}
                                  placeholder={isRTL ? 'اختر قيم متعددة' : 'Select multiple'}
                                  multi={true}
                                />
                              );
                            }
                            return (
                              <input 
                                type="text" 
                                className="aq-input-text"
                                placeholder={isRTL ? 'قيم مفصولة بفواصل...' : 'Values separated by commas...'}
                                value={clause.value}
                                onChange={(e) => handleUpdateClause(clause.id, { value: e.target.value })}
                                style={{ height: '36px', boxSizing: 'border-box', padding: '0 8px' }}
                              />
                            );
                          }

                          if (isTextSearch) {
                            return (
                              <input 
                                type="text" 
                                className="aq-input-text"
                                placeholder={isRTL ? 'نص البحث...' : 'Search text...'}
                                value={clause.value}
                                onChange={(e) => handleUpdateClause(clause.id, { value: e.target.value })}
                                style={{ height: '36px', boxSizing: 'border-box', padding: '0 8px' }}
                              />
                            );
                          }

                          if (category === 'date') {
                            return (
                              <input 
                                type="date"
                                className="aq-input-text"
                                value={clause.value}
                                onChange={(e) => handleUpdateClause(clause.id, { value: e.target.value })}
                                style={{ height: '36px', boxSizing: 'border-box', padding: '0 8px' }}
                              />
                            );
                          }

                          if (clause.uniqueValues && clause.uniqueValues.length > 0) {
                            return (
                              <UniqueValueCombobox 
                                uniqueValues={clause.uniqueValues}
                                value={clause.value}
                                onChange={(val) => handleUpdateClause(clause.id, { value: val })}
                                placeholder={isRTL ? 'القيمة...' : 'Value...'}
                                isRTL={isRTL}
                              />
                            );
                          }

                          return (
                            <input 
                              type="text" 
                              className="aq-input-text"
                              placeholder={isRTL ? 'القيمة...' : 'Value...'}
                              value={clause.value}
                              onChange={(e) => handleUpdateClause(clause.id, { value: e.target.value })}
                              style={{ height: '36px', boxSizing: 'border-box', padding: '0 8px' }}
                            />
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                ))}

                <button className="aq-add-clause-row-btn" onClick={handleAddClauseRow} type="button">
                  <Plus size={14} />
                  <span>{isRTL ? 'إضافة شرط جديد' : 'Add Clause'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Action Bar */}
          <div className="aq-actions-row" style={{ flexShrink: 0, marginTop: '16px' }}>
            <button 
              className="aq-action-btn aq-btn-reset" 
              onClick={handleResetQuery}
              disabled={isQuerying}
              type="button"
            >
              <RotateCcw size={14} />
              <span>{isRTL ? 'إعادة تعيين' : 'Reset Query'}</span>
            </button>

            <button 
              className="aq-action-btn aq-btn-apply"
              onClick={handleApplyQuery}
              disabled={!activeSqlExpression.trim() || isQuerying || !!validationError}
              type="button"
            >
              {isQuerying ? <RefreshCw size={14} className="aq-spin" /> : <Play size={14} />}
              <span>{isQuerying ? (isRTL ? 'جاري البحث...' : 'Searching...') : (isRTL ? 'تطبيق الاستعلام' : 'Apply Query')}</span>
            </button>
          </div>

        </div>

        {/* SCREEN 3: Matching Results view */}
        <div className="aq-wizard-step" style={{ width: '33.333%', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', borderLeft: isRTL ? 'none' : '1px solid #f1f5f9', borderRight: isRTL ? '1px solid #f1f5f9' : 'none' }}>
          
          {/* Header of Step 3: Back Button to Query Builder */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0px', borderBottom: 'none', background: 'none', flexShrink: 0, marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button 
                onClick={() => setStep(2)} 
                type="button" 
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: '#1a2f4d', 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  padding: '6px',
                  borderRadius: '6px',
                  transition: 'background-color 0.2s'
                }}
                className="aq-header-back-btn"
              >
                {isRTL ? <ArrowRight size={18} style={{ color: '#df261c' }} /> : <ArrowLeft size={18} style={{ color: '#df261c' }} />}
              </button>
              
              <span style={{ fontWeight: 700, fontSize: '15px', color: '#1a2f4d' }}>
                {isRTL ? 'نتائج المطابقة' : 'Matching Results'}
              </span>
            </div>
            
            {/* Results count badge in header */}
            <span className="aq-results-badge" style={{
              background: '#fef2f2',
              color: '#df261c',
              padding: '4px 10px',
              borderRadius: '9999px',
              fontSize: '12px',
              fontWeight: 700
            }}>
              {isQuerying ? '...' : results.length.toLocaleString()}
            </span>
          </div>

          {/* Results Screen Scrollable Content */}
          <div style={{ flex: 1, padding: '0px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }} className="aq-scrollable-content">
            
            {/* Bulk Export Options */}
            {results.length > 0 && (
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                marginBottom: '4px',
                flexShrink: 0
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b' }}>
                    {isRTL ? "خيارات التصدير الجماعي" : "Bulk Export Options"}
                  </span>
                  <button
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#df261c',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: 0
                    }}
                    onClick={() => {
                      const oidField = selectedLayerItem?.rawLayer?.objectIdField || 'OBJECTID';
                      if (checkedOids.length === results.length) {
                        setCheckedOids([]);
                      } else {
                        setCheckedOids(results.map(f => f.attributes[oidField]).filter(id => id !== undefined && id !== null));
                      }
                    }}
                  >
                    {checkedOids.length === results.length 
                      ? (isRTL ? "إلغاء تحديد الكل" : "Deselect All") 
                      : (isRTL ? "تحديد الكل" : "Select All")}
                  </button>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 500, color: '#475569', userSelect: 'none' }}>
                    <input 
                      type="checkbox"
                      checked={mergeSelected}
                      onChange={(e) => setMergeSelected(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    {isRTL ? "دمج في طبقة واحدة" : "Merge into single layer"}
                  </label>
                  
                  {isBulkAdded() ? (
                    <button
                      disabled
                      style={{
                        background: '#10b981',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'background-color 0.2s',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                      }}
                    >
                      <Check size={12} />
                      <span>
                        {isRTL ? "تمت الإضافة للموقع" : "Added to Map"}
                      </span>
                    </button>
                  ) : (
                    <button
                      style={{
                        background: '#df261c',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'background-color 0.2s',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                      }}
                      onClick={handleAddSelectedFeatures}
                    >
                      <Plus size={12} />
                      <span>
                        {isRTL 
                          ? `إضافة المحدد (${checkedOids.length})` 
                          : `Add Selected (${checkedOids.length})`}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Results List */}
            {results.length === 0 ? (
              !isQuerying && (
                <div className="aq-empty-results" style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '32px 16px',
                  color: '#64748b',
                  textAlign: 'center',
                  gap: '8px',
                  background: '#f8fafc',
                  borderRadius: '12px',
                  border: '1px dashed #cbd5e1'
                }}>
                  <AlertTriangle size={24} style={{ color: '#94a3b8' }} />
                  <p style={{ margin: 0, fontSize: '13px' }}>
                    {isRTL ? 'لا توجد نتائج مطابقة لشروط البحث.' : 'No features match this query expression.'}
                  </p>
                </div>
              )
            ) : (
              <div className="aq-results-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {results.map((feature, idx) => {
                  const oidField = selectedLayerItem?.rawLayer?.objectIdField || 'OBJECTID';
                  const oid = feature.attributes[oidField];
                  const isHighlighted = highlightedFeatureId === oid;
                  const isChecked = checkedOids.includes(oid);
                  return (
                    <div 
                      key={idx} 
                      className={`aq-result-item ${isHighlighted ? 'highlighted' : ''}`}
                      onClick={() => handleFeatureClick(feature)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: isHighlighted ? '#fef2f2' : '#ffffff',
                        border: isHighlighted ? '1px solid #fca5a5' : '1px solid #e2e8f0',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.2s',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                      }}
                    >
                      <div className="aq-result-item-info" style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                        <input 
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            e.stopPropagation();
                            if (e.target.checked) {
                              setCheckedOids(prev => [...prev, oid]);
                            } else {
                              setCheckedOids(prev => prev.filter(id => id !== oid));
                            }
                          }}
                          style={{ cursor: 'pointer', marginRight: isRTL ? 0 : '4px', marginLeft: isRTL ? '4px' : 0 }}
                        />
                        <span className="aq-result-index" style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: isHighlighted ? '#ef4444' : '#f1f5f9',
                          color: isHighlighted ? '#ffffff' : '#475569',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '10px',
                          fontWeight: 700,
                          flexShrink: 0
                        }}>{idx + 1}</span>
                        {editingFeature && editingFeature.index === idx ? (
                          <div style={{ flex: 1, minWidth: 0, paddingRight: isRTL ? 0 : '8px', paddingLeft: isRTL ? '8px' : 0 }} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={newNameValue}
                              onChange={(e) => setNewNameValue(e.target.value)}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveRename();
                                if (e.key === 'Escape') setEditingFeature(null);
                              }}
                              style={{
                                width: '100%',
                                padding: '4px 8px',
                                fontSize: '12px',
                                border: '1.5px solid #cbd5e1',
                                borderRadius: '4px',
                                outline: 'none',
                                boxSizing: 'border-box',
                                background: '#ffffff',
                                color: '#334155'
                              }}
                            />
                          </div>
                        ) : (
                          <span className="aq-result-label" style={{
                            fontSize: '12px',
                            color: isHighlighted ? '#991b1b' : '#334155',
                            fontWeight: isHighlighted ? 600 : 500,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            flex: 1
                          }}>{getFeatureLabel(feature, idx)}</span>
                        )}
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                        {editingFeature && editingFeature.index === idx ? (
                          <>
                            <button
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#10b981',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '4px',
                                transition: 'all 0.2s'
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSaveRename();
                              }}
                              title={isRTL ? "حفظ" : "Save"}
                            >
                              <Check size={14} />
                            </button>
                            <button
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '4px',
                                transition: 'all 0.2s'
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingFeature(null);
                              }}
                              title={isRTL ? "إلغاء" : "Cancel"}
                            >
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: isHighlighted ? '#ef4444' : '#64748b',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '4px',
                                transition: 'all 0.2s'
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingFeature({ feature, index: idx });
                                setNewNameValue(customNames[getFeatureKey(feature, idx)] || getFeatureLabel(feature, idx));
                              }}
                              title={isRTL ? "إعادة تسمية" : "Rename"}
                            >
                              <Pencil size={13} />
                            </button>

                            <button
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: isHighlighted ? '#ef4444' : '#64748b',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '4px',
                                transition: 'all 0.2s'
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleFeatureClick(feature);
                              }}
                              title={isRTL ? "تكبير" : "Zoom To"}
                            >
                              <ZoomIn size={13} />
                            </button>
                            
                            {isFeatureAdded(feature, idx) ? (
                              <button
                                disabled
                                style={{
                                  background: '#ecfdf5',
                                  border: '1px solid #a7f3d0',
                                  borderRadius: '4px',
                                  padding: '4px 6px',
                                  fontSize: '10px',
                                  fontWeight: '600',
                                  color: '#047857',
                                  cursor: 'not-allowed',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '2px',
                                  transition: 'all 0.2s'
                                }}
                              >
                                <Check size={10} />
                                <span>{isRTL ? "تمت الإضافة" : "Added"}</span>
                              </button>
                            ) : (
                              <button
                                style={{
                                  background: '#f1f5f9',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '4px',
                                  padding: '4px 6px',
                                  fontSize: '10px',
                                  fontWeight: '600',
                                  color: '#1a2f4d',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '2px',
                                  transition: 'all 0.2s'
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddSingleFeature(feature, idx);
                                }}
                                title={isRTL ? "إضافة كطبقة تحليل" : "Add as analysis layer"}
                              >
                                <Plus size={10} />
                                <span>{isRTL ? "إضافة" : "Add"}</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sticky Footer for Clear Selection */}
          {results.length > 0 && (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'flex-end', 
              paddingTop: '12px', 
              background: 'transparent',
              flexShrink: 0,
              marginTop: 'auto'
            }}>
              <button 
                className="aq-action-btn aq-btn-reset" 
                style={{ 
                  height: '36px', 
                  borderColor: '#cbd5e1', 
                  color: '#475569', 
                  background: '#f8fafc',
                  padding: '0 16px',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                }}
                onClick={handleClearSelection}
                type="button"
              >
                <Trash2 size={13} />
                <span>{isRTL ? 'مسح التحديد الحالي' : 'Clear Selection'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Toast Notification */}
        {toastMessage && (
          <div style={{
            position: 'absolute',
            bottom: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1e293b',
            color: '#ffffff',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: '600',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            zIndex: 9999,
            pointerEvents: 'none',
            animation: 'fade-in 0.2s ease-out',
            textAlign: 'center'
          }}>
            {toastMessage}
          </div>
        )}

      </div>
    </div>
  );
};

export default AdvancedQueryPanel;
