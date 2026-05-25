import React, { useState, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import {
  Upload, File, Trash2, Maximize2, AlertCircle,
  CheckCircle2, RefreshCw, Database, Eye, EyeOff,
  X, ChevronDown, MapPin
} from 'lucide-react';
import GeoJSONLayer from '@arcgis/core/layers/GeoJSONLayer';
import CSVLayer from '@arcgis/core/layers/CSVLayer';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import Point from '@arcgis/core/geometry/Point';
import Polygon from '@arcgis/core/geometry/Polygon';
import Polyline from '@arcgis/core/geometry/Polyline';
import SpatialReference from '@arcgis/core/geometry/SpatialReference';
import * as projectOperator from '@arcgis/core/geometry/operators/projectOperator';
import * as XLSX from 'xlsx';
import shp from 'shpjs';
import './AddDataPanel.css';

// Supported extensions per type
const TYPE_EXTS = {
  GeoJSON:   ['.geojson', '.json'],
  Shapefile: ['.zip'],
  CSV:       ['.csv'],
  Excel:     ['.xlsx', '.xls'],
};

const UNSUPPORTED_FORMATS = ['KML', 'DXF', 'DWG', 'DGN'];

// Vibrant, curated color palette for symbology and tree rendering
const LAYER_COLORS = [
  [223, 38, 28],   // Red
  [30, 60, 114],   // Blue
  [16, 185, 129],  // Emerald Green
  [245, 158, 11],  // Amber Yellow
  [139, 92, 246],  // Purple
  [236, 72, 153],  // Pink
  [6, 182, 212],   // Cyan
  [100, 116, 139]  // Slate
];
let colorIdx = 0;
const nextColor = () => LAYER_COLORS[colorIdx++ % LAYER_COLORS.length];

/**
 * Helper: Find a suitable categorization field and its unique values
 */
const findCategorizationField = (items) => {
  if (!items || items.length === 0) return null;
  const sample = items.slice(0, 100);
  
  // Extract keys from first item (properties or attributes)
  const firstItem = sample[0];
  const keys = Object.keys(firstItem.properties || firstItem.attributes || firstItem || {});
  if (keys.length === 0) return null;

  // Priority categories field names
  const priorityKeys = ['type', 'category', 'class', 'status', 'group', 'layer', 'sublayer', 'governorate', 'gov'];
  
  const getVal = (item, key) => {
    if (item.properties) return item.properties[key];
    if (item.attributes) return item.attributes[key];
    return item[key];
  };

  for (const pk of priorityKeys) {
    const found = keys.find(k => k.toLowerCase() === pk);
    if (found) {
      const vals = new Set(items.map(item => getVal(item, found)).filter(v => v !== undefined && v !== null && v !== ''));
      if (vals.size > 1 && vals.size <= 15) {
        return { field: found, values: Array.from(vals) };
      }
    }
  }

  // Fallback: search any other string/number field with 2 to 10 unique values
  for (const key of keys) {
    if (/^(x|y|lat|lon|lng|id|objectid|fid)$/i.test(key)) continue;
    const vals = new Set(items.map(item => getVal(item, key)).filter(v => v !== undefined && v !== null && v !== ''));
    if (vals.size > 1 && vals.size <= 10) {
      return { field: key, values: Array.from(vals) };
    }
  }
  return null;
};

/**
 * Helper: Detect geometry type of GeoJSON collection
 */
const getGeometryType = (geojson) => {
  const features = geojson.features || [];
  if (features.length === 0) return 'point';
  const geomType = features[0].geometry?.type;
  if (!geomType) return 'point';
  if (geomType.includes('Polygon')) return 'polygon';
  if (geomType.includes('LineString')) return 'polyline';
  return 'point';
};

/**
 * Helper: Create symbol based on geometry type and color
 */
const createSymbol = (geometryType, color) => {
  if (geometryType === 'polygon') {
    return {
      type: 'simple-fill',
      color: [...color, 0.5], // Guaranteed 50% opacity (not fully transparent)
      outline: { color: color, width: 1.5 }
    };
  } else if (geometryType === 'polyline') {
    return {
      type: 'simple-line',
      color: color,
      width: 2.5
    };
  } else {
    return {
      type: 'simple-marker',
      color: color,
      outline: { color: [255, 255, 255], width: 1 },
      size: 9
    };
  }
};

/**
 * Helper: Create definition expression for categories
 */
const buildDefinitionExpression = (field, checkedValues) => {
  if (checkedValues.length === 0) return "1=0"; // Show nothing
  const formattedVals = checkedValues.map(val => {
    if (typeof val === 'string') {
      return `'${val.replace(/'/g, "''")}'`;
    }
    return val;
  });
  return `${field} IN (${formattedVals.join(', ')})`;
};

const AddDataPanel = ({
  view,
  layerOrder,     setLayerOrder,
  layerVisibility, setLayerVisibility,
  results = [],   setResults,
  expandedItems = {}, setExpandedItems,
}) => {
  const { t, lang } = useLanguage();
  const isRTL = lang === 'AR';

  const [activeTab,    setActiveTab]    = useState('add');
  const [fileType,     setFileType]     = useState('GeoJSON');
  const [wkid,         setWkid]         = useState('4326');
  const [isUploading,  setIsUploading]  = useState(false);
  const [error,        setError]        = useState(null);

  // Excel column-picker state
  const [excelPicker,  setExcelPicker]  = useState(null); // { columns, data, fileName }
  const [xCol,         setXCol]         = useState('');
  const [yCol,         setYCol]         = useState('');
  const [excelError,   setExcelError]   = useState('');

  const fileInputRef = useRef(null);

  /* ── helpers ─────────────────────────────────────────────────────── */

  const registerLayerInPanel = (layer, id) => {
    if (setLayerOrder)      setLayerOrder(prev => [id, ...prev]);
    if (setLayerVisibility) setLayerVisibility(prev => ({ ...prev, [id]: true }));
  };

  const zoomTo = async (layer, logContext = 'General') => {
    if (!view) return;
    try {
      console.log(`[AddData Zoom] Waiting for layer to load... (${logContext})`);
      await layer.when();
      console.log(`[AddData Zoom] Layer loaded successfully. Load status:`, layer.loadStatus);
      
      let extent = layer.fullExtent;
      if (layer.queryExtent) {
         try {
            const extResult = await layer.queryExtent();
            if (extResult && extResult.count > 0 && extResult.extent) {
               extent = extResult.extent;
            }
         } catch (e) {
            console.log('[AddData Zoom] queryExtent failed', e);
         }
      }

      console.log(`[AddData Zoom] Computed extent:`, extent ? { xmin: extent.xmin, ymin: extent.ymin, xmax: extent.xmax, ymax: extent.ymax, spatialReference: extent.spatialReference?.wkid } : null);

      if (extent && !isNaN(extent.xmin) && isFinite(extent.xmin) && isFinite(extent.xmax)) {
        await view.goTo(extent.expand(1.2));
        console.log(`[AddData Zoom] Zoom to extent complete.`);
      } else if (layer.source && layer.source.length > 0) {
        await view.goTo(layer.source.toArray());
        console.log(`[AddData Zoom] Zoom to source graphics complete.`);
      } else if (layer.graphics && layer.graphics.length > 0) {
        await view.goTo(layer.graphics.toArray());
        console.log(`[AddData Zoom] Zoom to graphics complete.`);
      } else {
        console.warn(`[AddData Zoom] Warning: Layer has no valid extent or graphics. Might be empty or misprojected.`);
      }
    } catch (e) {
      console.warn(`[AddData Zoom] Zoom to extent failed:`, e);
    }
  };

  const addTreeResult = (resultObj) => {
    setResults(prev => [resultObj, ...prev]);
    // Expand newly added layer tree automatically
    setExpandedItems(prev => ({ ...prev, [resultObj.id]: true }));
    setActiveTab('results');
  };

  /* ── file drop / change ──────────────────────────────────────────── */

  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };

  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    const f = e.dataTransfer.files?.[0];
    if (f) processFile(f);
  };

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
    e.target.value = '';
  };

  /* ── main process ────────────────────────────────────────────────── */

  const processFile = async (file) => {
    setError(null);
    const ext = '.' + file.name.split('.').pop().toLowerCase();

    // Unsupported format gate
    if (UNSUPPORTED_FORMATS.includes(fileType)) {
      setError(`${fileType} is not currently supported for direct upload. Please convert to GeoJSON or Shapefile first.`);
      return;
    }

    const allowed = TYPE_EXTS[fileType] || [];
    if (!allowed.includes(ext)) {
      setError(`Wrong file extension for ${fileType}. Expected: ${allowed.join(', ')} — got: ${ext}`);
      return;
    }

    // Excel: show column picker first
    if (fileType === 'Excel') {
      setIsUploading(true);
      try {
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);
        if (!data.length) throw new Error('Excel file appears to be empty.');
        const cols = Object.keys(data[0]);
        const guessX = cols.find(c => /^(lon|lng|longitude|x)$/i.test(c)) || '';
        const guessY = cols.find(c => /^(lat|latitude|y)$/i.test(c)) || '';
        setXCol(guessX);
        setYCol(guessY);
        setExcelError('');
        setExcelPicker({ columns: cols, data, fileName: file.name });
      } catch (err) {
        setError(err.message);
      } finally {
        setIsUploading(false);
      }
      return;
    }

    setIsUploading(true);
    try {
      await ingestFile(file, file.name, ext);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to load file.');
    } finally {
      setIsUploading(false);
    }
  };

  /* ── ingest non-Excel files ──────────────────────────────────────── */

  const ingestFile = async (file, fileName, ext) => {
    let srWkid = parseInt(wkid, 10) || 4326;

    if (fileType === 'GeoJSON' && (ext === '.geojson' || ext === '.json')) {
      const text = await file.text();
      let geojson;
      try { geojson = JSON.parse(text); } catch { throw new Error('File is not valid JSON/GeoJSON.'); }
      if (!geojson.type) throw new Error('File does not appear to be a valid GeoJSON object.');
      
      if (geojson.crs && geojson.crs.properties && geojson.crs.properties.name) {
        const match = geojson.crs.properties.name.match(/EPSG::(\d+)/);
        if (match) {
          srWkid = parseInt(match[1], 10);
        }
      }
      
      await addGeoJSONLayer(geojson, fileName, srWkid);
    }
    else if (fileType === 'CSV' && ext === '.csv') {
      await addCSVLayer(file, fileName, srWkid);
    }
    else if (fileType === 'Shapefile' && ext === '.zip') {
      await addShapefile(file, fileName, srWkid);
    }
    else {
      throw new Error(`Unsupported format combination: ${fileType} / ${ext}`);
    }
  };

  /* ── GeoJSON layer ───────────────────────────────────────────────── */

  // flatMode = true  → single entry in panel, no category children (used by Shapefile)
  // flatMode = false → detect categories, show children in panel (used by GeoJSON)
  const addGeoJSONLayer = async (geojson, title, srWkid) => {
    console.log('[AddData GeoJSON Import] === STARTING GEOJSON IMPORT ===');
    console.log('[AddData GeoJSON Import] Title:', title);
    console.log('[AddData GeoJSON Import] Feature count:', geojson.features?.length);
    console.log('[AddData GeoJSON Import] Embedded CRS:', geojson.crs);
    
    // CRS detection
    let sourceWkid = srWkid || 4326;
    if (geojson.crs?.properties?.name) {
       const match = geojson.crs.properties.name.match(/EPSG::(\d+)/);
       if (match) sourceWkid = parseInt(match[1], 10);
    }
    const sourceSR = new SpatialReference({ wkid: sourceWkid });
    console.log('[AddData GeoJSON Import] Extracted/Fallback WKID:', sourceWkid);
    console.log('[AddData GeoJSON Import] Map CRS/WKID:', view.spatialReference.wkid);
    
    const geomType = getGeometryType(geojson);
    console.log('[AddData GeoJSON Import] Detected geometry type:', geomType);

    if (geojson.features?.length > 0) {
      console.log('[AddData GeoJSON Import] First coordinate sample:', JSON.stringify(geojson.features[0].geometry.coordinates));
    } else {
      console.warn('[AddData GeoJSON Import] WARNING: GeoJSON contains no features!');
    }

    if (!projectOperator.isLoaded()) {
      await projectOperator.load();
    }
    const mapSR = view.spatialReference;

    // Parent level variables
    const parentId = `uploaded-geojson-parent-${crypto.randomUUID()}`;
    const parentTitle = title; 
    
    // Child level variables
    const childLayerId = `uploaded-geojson-child-${crypto.randomUUID()}`;
    const subTitle = parentTitle.substring(0, parentTitle.lastIndexOf('.')) || parentTitle; 
    
    const count = geojson.features?.length ?? 0;
    const defaultColor = nextColor();

    const graphics = [];
    let objectIdCounter = 1;

    for (const feat of (geojson.features || [])) {
       let geom;
       const coords = feat.geometry?.coordinates;
       const type = feat.geometry?.type;
       if (!coords) continue;

       if (type === 'Point') {
          geom = new Point({ x: coords[0], y: coords[1], spatialReference: sourceSR });
       } else if (type === 'LineString') {
          geom = new Polyline({ paths: [coords], spatialReference: sourceSR });
       } else if (type === 'MultiLineString') {
          geom = new Polyline({ paths: coords, spatialReference: sourceSR });
       } else if (type === 'Polygon') {
          geom = new Polygon({ rings: coords, spatialReference: sourceSR });
       } else if (type === 'MultiPolygon') {
          const allRings = [];
          coords.forEach(polyRings => allRings.push(...polyRings));
          geom = new Polygon({ rings: allRings, spatialReference: sourceSR });
       }
       
       if (!geom) continue;

       // Check if projection is necessary (avoid double projecting 3857/102100)
       const isEquivalentSR = (wkid1, wkid2) => {
          if (wkid1 === wkid2) return true;
          const wms1 = wkid1 === 102100 || wkid1 === 3857 || wkid1 === 102113 || wkid1 === 900913;
          const wms2 = wkid2 === 102100 || wkid2 === 3857 || wkid2 === 102113 || wkid2 === 900913;
          return wms1 && wms2;
       };

       let projectedGeom = geom;
       if (sourceSR.wkid && mapSR.wkid && !isEquivalentSR(sourceSR.wkid, mapSR.wkid)) {
          projectedGeom = projectOperator.execute(geom, mapSR);
       }

       const attributes = { ...feat.properties, ObjectID: objectIdCounter++ };
       graphics.push(new Graphic({
         geometry: projectedGeom,
         attributes
       }));
    }

    const symbol = createSymbol(geomType, defaultColor);

    const layer = new FeatureLayer({
      id: childLayerId,
      title: `${parentTitle} — ${subTitle}`,
      source: graphics,
      geometryType: geomType,
      objectIdField: "ObjectID",
      fields: [
        { name: "ObjectID", alias: "ObjectID", type: "oid" }
      ],
      renderer: {
        type: 'simple',
        symbol
      },
      spatialReference: mapSR,
      visible: true
    });

    // Extract other fields from properties if available
    if (graphics.length > 0 && graphics[0].attributes) {
      Object.keys(graphics[0].attributes).forEach(key => {
        if (key !== "ObjectID") {
           layer.fields.push({ name: key, alias: key, type: "string" });
        }
      });
    }

    console.log('[AddData GeoJSON Import] Layer instance created. Renderer assigned:', layer.renderer?.type);
    console.log('[AddData GeoJSON Import] Renderer object:', layer.renderer);

    view.map.add(layer);
    // Move layer to front so it's not hidden behind older spatial analysis layers
    view.map.reorder(layer, view.map.layers.length - 1);
    
    console.log('[AddData GeoJSON Import] Layer added to map. ID:', childLayerId);
    console.log('[AddData GeoJSON Import] Map layer count after add:', view.map.layers.length);

    registerLayerInPanel(layer, childLayerId);

    const childObj = {
      id: childLayerId,
      name: subTitle,
      visible: true,
      layer,
      color: defaultColor,
      geometryType: geomType,
      featureCount: count
    };

    const resultObj = {
      id: parentId,
      name: parentTitle,
      date: new Date().toLocaleString(),
      featureCount: count,
      visible: true,
      type: 'multi-file',
      children: [childObj]
    };

    addTreeResult(resultObj);
    console.log('[AddData GeoJSON Import] Added to Results Panel.');
    
    zoomTo(layer, title);
    console.log('[AddData GeoJSON Import] === IMPORT PIPELINE COMPLETE ===');
  };

  /* ── CSV layer ───────────────────────────────────────────────────── */

  const addCSVLayer = async (file, title, srWkid) => {
    const text = await file.text();
    const blob = new Blob([text], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const layerId = `uploaded-csv-${crypto.randomUUID()}`;

    // Parse header to detect lat/lon columns
    const firstLine = text.split('\n')[0];
    const headers = firstLine.split(',').map(h => h.trim().replace(/"/g, ''));
    const latField = headers.find(h => /^(lat|latitude|y)$/i.test(h)) || 'latitude';
    const lonField = headers.find(h => /^(lon|lng|longitude|x)$/i.test(h)) || 'longitude';

    const defaultColor = nextColor();
    const layer = new CSVLayer({
      url,
      id: layerId,
      title,
      latitudeField: latField,
      longitudeField: lonField,
      spatialReference: new SpatialReference({ wkid: srWkid }),
      renderer: {
        type: 'simple',
        symbol: createSymbol('point', defaultColor)
      }
    });

    view.map.add(layer);
    registerLayerInPanel(layer, layerId);

    const resultObj = {
      id: layerId,
      name: title,
      layer,
      date: new Date().toLocaleString(),
      featureCount: '?',
      visible: true,
      type: 'flat',
      color: defaultColor,
      geometryType: 'point',
      children: []
    };

    addTreeResult(resultObj);
    zoomTo(layer);
  };

  /* ── Shapefile ───────────────────────────────────────────────────── */

  const addShapefile = async (file, baseTitle, srWkid) => {
    const ab = await file.arrayBuffer();
    const result = await shp(ab);

    const collections = Array.isArray(result) ? result : [result];
    const parentId = `uploaded-shapefile-parent-${crypto.randomUUID()}`;
    const parentTitle = baseTitle; // Consistently use the uploaded filename (e.g., Gov.zip, Sampledata.zip)

    const children = [];
    let totalCount = 0;

    for (let idx = 0; idx < collections.length; idx++) {
      const geojson = collections[idx];
      const subTitle = geojson.fileName || `Layer ${idx + 1}`;
      const blob = new Blob([JSON.stringify(geojson)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const childLayerId = `uploaded-shp-child-${crypto.randomUUID()}`;
      const geomType = getGeometryType(geojson);
      const count = geojson.features?.length || 0;
      totalCount += count;
      const color = LAYER_COLORS[idx % LAYER_COLORS.length];

      const childLayer = new GeoJSONLayer({
        url,
        id: childLayerId,
        title: `${parentTitle} — ${subTitle}`,
        spatialReference: new SpatialReference({ wkid: srWkid }),
        renderer: {
          type: 'simple',
          symbol: createSymbol(geomType, color)
        }
      });

      view.map.add(childLayer);
      registerLayerInPanel(childLayer, childLayerId);

      children.push({
        id: childLayerId,
        name: subTitle,
        visible: true,
        layer: childLayer,
        color,
        geometryType: geomType,
        featureCount: count
      });
    }

    const resultObj = {
      id: parentId,
      name: parentTitle,
      date: new Date().toLocaleString(),
      featureCount: totalCount,
      visible: true,
      type: 'multi-file',
      children
    };

    addTreeResult(resultObj);
    if (children[0]?.layer) zoomTo(children[0].layer);
  };

  /* ── Excel: confirm column picker ───────────────────────────────── */

  const confirmExcelImport = async () => {
    setExcelError('');
    if (!xCol || !yCol) {
      setExcelError('Please select both X (Longitude) and Y (Latitude) columns.');
      return;
    }
    if (xCol === yCol) {
      setExcelError('X and Y columns must be different.');
      return;
    }
    setIsUploading(true);
    try {
      const { data, fileName } = excelPicker;
      const layerId = `uploaded-excel-${crypto.randomUUID()}`;
      const srWkid = parseInt(wkid, 10) || 4326;

      // Check for Excel categories
      const catInfo = findCategorizationField(data);
      let children = [];
      let layerType = 'flat';

      const flatColor = nextColor();
      const graphics = data
        .filter(row => row[xCol] != null && row[yCol] != null)
        .map((row, idx) => {
          let color = flatColor;
          if (catInfo) {
            layerType = 'single-categorized';
            const catVal = row[catInfo.field];
            const catIdx = catInfo.values.indexOf(catVal);
            color = LAYER_COLORS[catIdx >= 0 ? catIdx % LAYER_COLORS.length : 7];
          }

          return new Graphic({
            geometry: new Point({
              x: parseFloat(row[xCol]),
              y: parseFloat(row[yCol]),
              spatialReference: new SpatialReference({ wkid: srWkid }),
            }),
            attributes: { ...row },
            symbol: createSymbol('point', color)
          });
        });

      if (!graphics.length) throw new Error('No valid coordinate rows found in the selected columns.');

      if (catInfo) {
        catInfo.values.forEach((val, idx) => {
          children.push({
            id: `${layerId}-cat-${val}`,
            name: val,
            visible: true,
            color: LAYER_COLORS[idx % LAYER_COLORS.length],
            geometryType: 'point',
            featureCount: data.filter(r => r[catInfo.field] === val).length
          });
        });
      }

      const layer = new GraphicsLayer({ id: layerId, title: fileName, graphics });
      view.map.add(layer);
      registerLayerInPanel(layer, layerId);

      const resultObj = {
        id: layerId,
        name: fileName,
        layer,
        date: new Date().toLocaleString(),
        featureCount: graphics.length,
        visible: true,
        type: layerType,
        catField: catInfo?.field || null,
        color: catInfo ? null : flatColor,
        geometryType: 'point',
        children
      };

      addTreeResult(resultObj);
      setExcelPicker(null);
      zoomTo(layer);
    } catch (err) {
      setExcelError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  /* ── visibility actions ──────────────────────────────────────────── */

  const handleToggleParentVisibility = (parentId) => {
    setResults(prev => prev.map(parent => {
      if (parent.id !== parentId) return parent;

      const nextVisible = !parent.visible;

      // Update actual layer(s) on map
      if (parent.type === 'multi-file') {
        parent.children.forEach(child => {
          if (child.layer) {
            child.layer.visible = nextVisible;
            if (setLayerVisibility) setLayerVisibility(p => ({ ...p, [child.id]: nextVisible }));
          }
        });
      } else if (parent.layer) {
        parent.layer.visible = nextVisible;
        if (setLayerVisibility) setLayerVisibility(p => ({ ...p, [parent.id]: nextVisible }));
        
        // For categorized layers, also reset definition expression on toggle-on
        if (parent.type === 'single-categorized') {
          if (nextVisible) {
            const checkedValues = parent.children.filter(c => c.visible).map(c => c.name);
            parent.layer.definitionExpression = buildDefinitionExpression(parent.catField, checkedValues);
          }
        }
      }

      return {
        ...parent,
        visible: nextVisible,
        children: parent.children.map(c => ({ ...c, visible: nextVisible }))
      };
    }));
  };

  const handleToggleChildVisibility = (parentId, childId) => {
    setResults(prev => prev.map(parent => {
      if (parent.id !== parentId) return parent;

      const children = parent.children.map(child => {
        if (child.id !== childId) return child;
        const nextVisible = !child.visible;

        // Apply visibility directly if separate map layer
        if (parent.type === 'multi-file' && child.layer) {
          child.layer.visible = nextVisible;
          if (setLayerVisibility) setLayerVisibility(p => ({ ...p, [child.id]: nextVisible }));
        }

        return { ...child, visible: nextVisible };
      });

      const anyVisible = children.some(c => c.visible);

      // Apply definitions or graphic filters
      if (parent.type === 'single-categorized' && parent.layer) {
        const checkedValues = children.filter(c => c.visible).map(c => c.name);
        
        if (parent.layer instanceof GraphicsLayer) {
          // Excel GraphicsLayer: toggle individual graphics matching this category
          const catField = parent.catField;
          parent.layer.graphics.forEach(g => {
            const val = g.attributes?.[catField];
            g.visible = checkedValues.includes(val);
          });
        } else {
          // GeoJSON / CSV Layer: apply definitionExpression
          parent.layer.definitionExpression = buildDefinitionExpression(parent.catField, checkedValues);
          parent.layer.visible = anyVisible;
        }
      }

      return {
        ...parent,
        visible: anyVisible,
        children
      };
    }));
  };

  /* ── zoom and delete ─────────────────────────────────────────────── */

  const handleZoom = (item) => {
    if (item.type === 'multi-file') {
      const activeChild = item.children.find(c => c.visible && c.layer);
      if (activeChild) zoomTo(activeChild.layer);
    } else if (item.layer) {
      zoomTo(item.layer);
    }
  };

  const handleDelete = (itemId) => {
    const item = results.find(r => r.id === itemId);
    if (item) {
      if (item.type === 'multi-file') {
        item.children.forEach(child => {
          if (child.layer) {
            view.map.remove(child.layer);
            if (setLayerOrder)      setLayerOrder(prev => prev.filter(id => id !== child.id));
            if (setLayerVisibility) setLayerVisibility(prev => { const n = {...prev}; delete n[child.id]; return n; });
          }
        });
      } else if (item.layer) {
        view.map.remove(item.layer);
        if (setLayerOrder)      setLayerOrder(prev => prev.filter(id => id !== itemId));
        if (setLayerVisibility) setLayerVisibility(prev => { const n = {...prev}; delete n[itemId]; return n; });
      }
    }
    setResults(prev => prev.filter(r => r.id !== itemId));
  };

  /* ── render ──────────────────────────────────────────────────────── */

  const isUnsupported = UNSUPPORTED_FORMATS.includes(fileType);
  const allowedExts = TYPE_EXTS[fileType]?.join(', ') ?? '';

  return (
    <div className={`add-data-panel${isRTL ? ' rtl' : ''}`} dir={isRTL ? 'rtl' : 'ltr'}>

      {/* Tabs */}
      <div className="tool-tabs">
        <button className={`tool-tab ${activeTab === 'add' ? 'active' : ''}`} onClick={() => setActiveTab('add')}>
          {t('addDataTabAdd')}
        </button>
        <button className={`tool-tab ${activeTab === 'results' ? 'active' : ''}`} onClick={() => setActiveTab('results')}>
          {t('addDataTabResults')} {results.length > 0 && <span className="tab-badge">{results.length}</span>}
        </button>
      </div>

      <div className="panel-content-scroll">
        {activeTab === 'add' ? (
          <div className="add-data-form">

            {/* File type */}
            <div className="form-group">
              <label>{t('addDataFileType')}</label>
              <div className="select-wrapper">
                <select className="tool-select" value={fileType} onChange={e => { setFileType(e.target.value); setError(null); setExcelPicker(null); setXCol(''); setYCol(''); setExcelError(''); }}>
                  <option>GeoJSON</option>
                  <option>Shapefile</option>
                  <option>CSV</option>
                  <option>Excel</option>
                  <option disabled>──────────</option>
                  <option>KML</option>
                  <option>DXF</option>
                  <option>DWG</option>
                  <option>DGN</option>
                </select>
                <ChevronDown size={14} className="select-chevron" />
              </div>
            </div>

            {/* Unsupported banner */}
            {isUnsupported ? (
              <div className="unsupported-banner">
                <AlertCircle size={16} />
                <div>
                  <strong>{fileType} {t('addDataUnsupported')}</strong>
                  <p>{t('addDataUnsupportedHint')}</p>
                </div>
              </div>
            ) : (
              <>
                {/* Drop zone */}
                <div
                  className={`upload-zone ${isUploading ? 'uploading' : ''}`}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={onFileChange}
                    accept={TYPE_EXTS[fileType]?.join(',') ?? '*'}
                  />
                  <div className="upload-content">
                    <div className="upload-icon-wrapper">
                      {isUploading
                        ? <RefreshCw size={24} color="#df261c" className="spinning" />
                        : <Upload size={24} color="#df261c" />
                      }
                    </div>
                    <p className="upload-title">
                      {isUploading ? t('addDataDropProcessing') : t('addDataDropTitle')}
                    </p>
                    <p className="upload-formats">{t('addDataAccepted')} {allowedExts}</p>
                    {!isUploading && (
                      <button className="browse-btn tertiary" onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                        {t('addDataBrowse')}
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline Excel Column Picker */}
                {fileType === 'Excel' && excelPicker && (
                  <>
                    <div className="excel-col-row">
                      <div className="form-group">
                        <label>{t('addDataXCoord')}</label>
                        <div className="select-wrapper">
                          <select className="tool-select" value={xCol} onChange={e => setXCol(e.target.value)}>
                            <option value="">{t('addDataSelectX')}</option>
                            {excelPicker.columns.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                          <ChevronDown size={14} className="select-chevron" />
                        </div>
                      </div>
                      <div className="form-group">
                        <label>{t('addDataYCoord')}</label>
                        <div className="select-wrapper">
                          <select className="tool-select" value={yCol} onChange={e => setYCol(e.target.value)}>
                            <option value="">{t('addDataSelectY')}</option>
                            {excelPicker.columns.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                          <ChevronDown size={14} className="select-chevron" />
                        </div>
                      </div>
                    </div>
                    {excelError && (
                      <div className="error-alert">
                        <AlertCircle size={14} />
                        <span>{excelError}</span>
                      </div>
                    )}
                  </>
                )}


                {/* WKID */}
                <div className="form-group">
                  <label>{t('addDataWkid')}</label>
                  <input
                    type="text"
                    className="tool-input"
                    placeholder="e.g. 4326"
                    value={wkid}
                    onChange={e => setWkid(e.target.value)}
                  />
                  <span className="form-hint">
                    {t('addDataWkidHint')}
                  </span>
                </div>
              </>
            )}

            {error && (
              <div className="error-alert">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
          </div>
        ) : (
          /* Results / Layers tree list */
          <div className="results-list">
            {results.length === 0 ? (
              <div className="empty-state">
                <div className="empty-card">
                  <div className="empty-icon-wrapper"><Database size={32} /></div>
                  <h3 className="empty-title">{t('addDataEmptyTitle')}</h3>
                  <p className="empty-desc">{t('addDataEmptyDesc')}</p>
                </div>
              </div>
            ) : (
              results.map(item => {
                const hasChildren = item.children && item.children.length > 0;
                const isExpanded = !!expandedItems[item.id];

                return (
                  <div key={item.id} className="result-tree-node">
                    {/* Parent Row */}
                    <div className={`result-row ${item.visible ? '' : 'hidden-layer'}`}>
                      <div className="result-row-first">
                        <div className="result-info">
                          {hasChildren && (
                            <button
                              className={`expand-btn ${isExpanded ? 'expanded' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedItems(prev => ({ ...prev, [item.id]: !isExpanded }));
                              }}
                            >
                              <ChevronDown size={14} />
                            </button>
                          )}
                          <input
                            type="checkbox"
                            className="custom-checkbox"
                            checked={item.visible}
                            onChange={() => handleToggleParentVisibility(item.id)}
                          />
                          {!hasChildren && (
                            <div className="child-symbol-wrapper" style={{ margin: '0 4px' }}>
                              {(() => {
                                const colorStr = item.color ? `rgb(${item.color.join(',')})` : '#3b82f6';
                                const fillStr = item.color ? `rgba(${item.color.join(',')}, 0.35)` : 'rgba(59, 130, 246, 0.35)';
                                
                                if (item.geometryType === 'polygon') {
                                  return (
                                    <div 
                                      className="legend-symbol polygon-symbol" 
                                      style={{
                                        width: '14px',
                                        height: '10px',
                                        backgroundColor: fillStr,
                                        border: `1.5px solid ${colorStr}`,
                                        borderRadius: '2px',
                                        boxSizing: 'border-box'
                                      }}
                                      title="Polygon"
                                    />
                                  );
                                }
                                if (item.geometryType === 'polyline') {
                                  return (
                                    <div 
                                      className="legend-symbol line-symbol" 
                                      style={{
                                        width: '14px',
                                        height: '0px',
                                        borderTop: `2.5px solid ${colorStr}`,
                                        borderRadius: '1px',
                                        margin: '5px 0',
                                        boxSizing: 'border-box'
                                      }}
                                      title="Line"
                                    />
                                  );
                                }
                                // Default/Point
                                return (
                                  <div 
                                    className="legend-symbol point-symbol" 
                                    style={{
                                      width: '8px',
                                      height: '8px',
                                      backgroundColor: colorStr,
                                      borderRadius: '50%',
                                      border: '1.2px solid #ffffff',
                                      boxShadow: '0 0 2px rgba(0,0,0,0.3)',
                                      boxSizing: 'border-box',
                                      margin: '1px 3px'
                                    }}
                                    title="Point"
                                  />
                                );
                              })()}
                            </div>
                          )}
                          <span className="result-name" title={item.name}>{item.name}</span>
                        </div>
                        <div className="result-actions">
                          <button className="action-btn" onClick={() => handleZoom(item)} title={t('addDataZoomTitle')}>
                            <Maximize2 size={15} />
                          </button>
                          <button className="action-btn delete-btn" onClick={() => handleDelete(item.id)} title={t('addDataDeleteTitle')}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      <div className="result-row-second">
                        <span className="result-feature-count">
                          {item.featureCount !== '?' ? `${item.featureCount} ${t('addDataFeatures')}` : t('addDataLoaded')}
                        </span>
                        <span className="result-upload-date">
                          {item.date}
                        </span>
                      </div>
                    </div>

                    {/* Child/Sub-layers List (Extends under the parent white background) */}
                    {hasChildren && isExpanded && (
                      <div className="result-children">
                        {item.children.map(child => (
                          <div key={child.id} className={`result-row child-row ${child.visible ? '' : 'hidden-layer'}`}>
                            <div className="result-info">
                              <input
                                type="checkbox"
                                className="custom-checkbox"
                                checked={child.visible}
                                onChange={() => handleToggleChildVisibility(item.id, child.id)}
                              />
                              <div className="child-symbol-wrapper">
                                {(() => {
                                  const colorStr = child.color ? `rgb(${child.color.join(',')})` : '#3b82f6';
                                  const fillStr = child.color ? `rgba(${child.color.join(',')}, 0.35)` : 'rgba(59, 130, 246, 0.35)';
                                  
                                  if (child.geometryType === 'polygon') {
                                    return (
                                      <div 
                                        className="legend-symbol polygon-symbol" 
                                        style={{
                                          width: '14px',
                                          height: '10px',
                                          backgroundColor: fillStr,
                                          border: `1.5px solid ${colorStr}`,
                                          borderRadius: '2px',
                                          boxSizing: 'border-box'
                                        }}
                                        title="Polygon"
                                      />
                                    );
                                  }
                                  if (child.geometryType === 'polyline') {
                                    return (
                                      <div 
                                        className="legend-symbol line-symbol" 
                                        style={{
                                          width: '14px',
                                          height: '0px',
                                          borderTop: `2.5px solid ${colorStr}`,
                                          borderRadius: '1px',
                                          margin: '5px 0',
                                          boxSizing: 'border-box'
                                        }}
                                        title="Line"
                                      />
                                    );
                                  }
                                  // Default/Point
                                  return (
                                    <div 
                                      className="legend-symbol point-symbol" 
                                      style={{
                                        width: '8px',
                                        height: '8px',
                                        backgroundColor: colorStr,
                                        borderRadius: '50%',
                                        border: '1.2px solid #ffffff',
                                        boxShadow: '0 0 2px rgba(0,0,0,0.3)',
                                        boxSizing: 'border-box',
                                        margin: '1px 3px'
                                      }}
                                      title="Point"
                                    />
                                  );
                                })()}
                              </div>
                              <div className="result-text child-text-row">
                                <span className="result-name child-name" title={child.name}>{child.name}</span>
                                {child.featureCount !== undefined && child.featureCount !== '?' && (
                                  <span className="result-meta child-count-meta">
                                    {child.featureCount} {child.featureCount === 1 ? t('addDataFeature') : t('addDataFeaturesPlural')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
      {activeTab === 'add' && fileType === 'Excel' && excelPicker && (
        <div className="panel-footer">
          <button
            className="primary-btn import-btn-fixed"
            onClick={confirmExcelImport}
            disabled={!xCol || !yCol || isUploading}
          >
            {isUploading
              ? <><RefreshCw size={14} className="spinning" /> {t('addDataImporting')}</>
              : t('addDataImportBtn')
            }
          </button>
        </div>
      )}
    </div>
  );
};

export default AddDataPanel;
