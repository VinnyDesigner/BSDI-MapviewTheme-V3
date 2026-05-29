import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, X, Plus, Filter, Trash2, ArrowRight, ArrowLeft, Play, Check, 
  RotateCcw, SlidersHorizontal, RefreshCw, ZoomIn, Info, AlertTriangle
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

const OPERATORS = [
  { id: '=', label: '=' },
  { id: '<>', label: '<>' },
  { id: '>', label: '>' },
  { id: '<', label: '<' },
  { id: '>=', label: '>=' },
  { id: '<=', label: '<=' },
  { id: 'LIKE', label: 'LIKE' },
  { id: 'IN', label: 'IN' }
];

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
  dynamicMapServerData
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
      
      const chosenVal = c.value.trim();
      
      let expr = "";
      if (hasNoValueInput(c.operator)) {
        expr = `${c.fieldName} ${c.operator}`;
      } else if (c.operator === 'LIKE') {
        expr = `${c.fieldName} LIKE '%${chosenVal}%'`;
      } else if (c.operator === 'IN' || c.operator === 'NOT IN') {
        const parts = chosenVal.split(',').map(p => p.trim());
        const formatted = parts.map(p => isString ? `'${p}'` : p).join(', ');
        expr = `${c.fieldName} ${c.operator} (${formatted})`;
      } else {
        const formattedVal = isString ? `'${chosenVal}'` : chosenVal;
        expr = `${c.fieldName} ${c.operator} ${formattedVal}`;
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
        const updated = { ...c, ...fieldsToUpdate };
        if (fieldsToUpdate.fieldName !== undefined && fieldsToUpdate.fieldName !== c.fieldName) {
          // Field changed, fetch unique values dynamically from service endpoint
          loadUniqueValuesForClause(clauseId, fieldsToUpdate.fieldName);
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
          queryResults = data.features.map(f => {
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

    // Redraw translucent red highlights for all selected features on map
    nextSelection.forEach(feature => {
      if (!feature.geometry) return;
      
      let symbol = null;
      const geomType = feature.geometry.type || selectedLayerItem.geometryType || '';
      const geomLower = geomType.toLowerCase();

      if (geomLower.includes('point') && !geomLower.includes('multipoint')) {
        symbol = {
          type: "simple-marker",
          style: "circle",
          color: [223, 38, 28, 0.15],
          size: 14,
          outline: { color: [223, 38, 28, 0.6], width: 1.5 }
        };
      } else if (geomLower.includes('polyline') || geomLower.includes('line')) {
        symbol = {
          type: "simple-line",
          color: [223, 38, 28, 0.6],
          width: 2.5,
          style: "solid"
        };
      } else {
        symbol = {
          type: "simple-fill",
          color: [223, 38, 28, 0.05],
          outline: { color: [223, 38, 28, 0.6], width: 1.5, style: "solid" }
        };
      }

      const selectionGraphic = new Graphic({
        geometry: feature.geometry,
        symbol: symbol
      });
      mapView.graphics.add(selectionGraphic);
    });

    // Zoom collectively to all matching selections
    if (nextSelection.length > 0) {
      const geometries = nextSelection.map(f => f.geometry).filter(Boolean);
      if (geometries.length > 0) {
        mapView.goTo(geometries).catch(err => {
          console.warn("mapView.goTo collective extent zoom failed:", err);
        });
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
    } catch (err) {
      console.warn("Applying visual map filter failed:", err);
    }

    setIsQuerying(false);
  };

  // Zoom & highlight helper
  const handleFeatureClick = (feature) => {
    if (!mapView || !feature.geometry) return;
    
    const oidField = selectedLayerItem.rawLayer.objectIdField || 'OBJECTID';
    const oid = feature.attributes[oidField];
    setHighlightedFeatureId(oid);

    mapView.graphics.removeAll();

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
            color: [223, 38, 28, 0.4],
            size: 16,
            outline: { color: "#df261c", width: 2.5 }
          };
        } else if (geomLower.includes('polyline') || geomLower.includes('line')) {
          symbol = {
            type: "simple-line",
            color: "#df261c",
            width: 3.5,
            style: "solid"
          };
        } else {
          symbol = {
            type: "simple-fill",
            color: [223, 38, 28, 0.15],
            outline: { color: "#df261c", width: 2.5, style: "solid" }
          };
        }
      } else {
        if (geomLower.includes('point') && !geomLower.includes('multipoint')) {
          symbol = {
            type: "simple-marker",
            style: "circle",
            color: [223, 38, 28, 0.15],
            size: 14,
            outline: { color: [223, 38, 28, 0.6], width: 1.5 }
          };
        } else if (geomLower.includes('polyline') || geomLower.includes('line')) {
          symbol = {
            type: "simple-line",
            color: [223, 38, 28, 0.6],
            width: 2.5,
            style: "solid"
          };
        } else {
          symbol = {
            type: "simple-fill",
            color: [223, 38, 28, 0.05],
            outline: { color: [223, 38, 28, 0.6], width: 1.5, style: "solid" }
          };
        }
      }

      const selectionGraphic = new Graphic({
        geometry: f.geometry,
        symbol: symbol
      });
      mapView.graphics.add(selectionGraphic);
    });

    mapView.goTo({ target: feature.geometry, zoom: 15 }, { duration: 800 }).then(() => {
      mapView.popup.open({
        features: [feature],
        location: feature.geometry.type === "point" ? feature.geometry : feature.geometry.extent?.center || feature.geometry
      });
    }).catch(err => {
      console.warn("mapView.goTo or popup failed:", err);
    });
  };

  // Reset filter and map state
  const handleResetQuery = async () => {
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
  const getFeatureLabel = (feature) => {
    if (!feature || !feature.attributes) return 'Feature';
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
        width: '200%',
        height: '100%',
        transition: 'transform 0.3s ease-in-out',
        transform: `translateX(${step === 1 ? '0%' : (isRTL ? '50%' : '-50%')})`
      }}>
        
        {/* SCREEN 1: Default Layer & Selection Type view */}
        <div className="aq-wizard-step" style={{ width: '50%', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
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
        <div className="aq-wizard-step" style={{ width: '50%', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', borderLeft: isRTL ? 'none' : '1px solid #f1f5f9', borderRight: isRTL ? '1px solid #f1f5f9' : 'none' }}>
          
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
                          options={OPERATORS.map(o => ({ id: o.id, title: o.label }))}
                          value={clause.operator}
                          onChange={(val) => handleUpdateClause(clause.id, { operator: val })}
                          placeholder="="
                        />
                      </div>

                      <div className="aq-field-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label className="aq-sublabel" style={{ fontSize: '11px', fontWeight: 600 }}>{isRTL ? 'القيمة' : 'Value'}</label>
                        {clause.isLoadingValues ? (
                          <div style={{ height: '36px', display: 'flex', alignItems: 'center', padding: '0 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', color: '#64748b', background: '#f8fafc', boxSizing: 'border-box' }}>
                            {isRTL ? 'جاري التحميل...' : 'Loading...'}
                          </div>
                        ) : clause.uniqueValues && clause.uniqueValues.length > 0 ? (
                          <CustomSelect 
                            options={clause.uniqueValues.map(v => ({ id: String(v), title: String(v) }))}
                            value={clause.value}
                            onChange={(val) => handleUpdateClause(clause.id, { value: val })}
                            placeholder={isRTL ? 'اختر القيمة' : 'Select Value'}
                          />
                        ) : (
                          <input 
                            type="text" 
                            className="aq-input-text"
                            placeholder={isRTL ? 'القيمة...' : 'Value...'}
                            value={clause.value}
                            onChange={(e) => handleUpdateClause(clause.id, { value: e.target.value })}
                            style={{ height: '36px', boxSizing: 'border-box' }}
                          />
                        )}
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
            <div className="aq-actions-row">
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

            {results.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <button 
                  className="aq-action-btn aq-btn-reset" 
                  style={{ width: '100%', height: '36px', borderColor: '#fecaca', color: '#dc2626', background: '#fef2f2' }}
                  onClick={handleClearSelection}
                  type="button"
                >
                  <Trash2 size={13} />
                  <span>{isRTL ? 'مسح التحديد الحالي' : 'Clear Selection'}</span>
                </button>
              </div>
            )}

            {/* Matching Results List */}
            {hasQueried && (
              <div className="aq-results-container animate-slide-up">
                <div className="aq-results-header">
                  <span className="aq-results-title">
                    {isRTL ? 'المعالم المطابقة' : 'Matching Results'}
                  </span>
                  <span className="aq-results-badge">
                    {isQuerying ? '...' : results.length.toLocaleString()}
                  </span>
                </div>

                {results.length === 0 ? (
                  !isQuerying && (
                    <div className="aq-empty-results">
                      <AlertTriangle size={24} />
                      <p>{isRTL ? 'لا توجد نتائج مطابقة لشروط البحث.' : 'No features match this query expression.'}</p>
                    </div>
                  )
                ) : (
                  <div className="aq-results-list">
                    {results.map((feature, idx) => {
                      const oidField = selectedLayerItem?.rawLayer?.objectIdField || 'OBJECTID';
                      const oid = feature.attributes[oidField];
                      const isHighlighted = highlightedFeatureId === oid;
                      return (
                        <div 
                          key={idx} 
                          className={`aq-result-item ${isHighlighted ? 'highlighted' : ''}`}
                          onClick={() => handleFeatureClick(feature)}
                        >
                          <div className="aq-result-item-info">
                            <span className="aq-result-index">{idx + 1}</span>
                            <span className="aq-result-label">{getFeatureLabel(feature)}</span>
                          </div>
                          <ZoomIn size={14} className="aq-zoom-icon" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

        </div>

      </div>
    </div>
  );
};

export default AdvancedQueryPanel;
