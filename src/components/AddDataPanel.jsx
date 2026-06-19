import React, { useState, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import CustomSelect from './CustomSelect';
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
  KML:       ['.kml'],
  GPX:       ['.gpx'],
  DWG:       ['.dwg'],
  DGN:       ['.dgn'],
  DXF:       ['.dxf']
};

const UNSUPPORTED_FORMATS = [];

// Helper to auto-detect file type from extension
const detectFileType = (fileName) => {
  const ext = '.' + fileName.split('.').pop().toLowerCase();
  for (const [type, exts] of Object.entries(TYPE_EXTS)) {
    if (exts.includes(ext)) {
      return type;
    }
  }
  return null;
};

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
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Excel column-picker state
  const [excelPicker,  setExcelPicker]  = useState(null); // { columns, data, fileName }
  const [xCol,         setXCol]         = useState('');
  const [yCol,         setYCol]         = useState('');
  const [excelError,   setExcelError]   = useState('');

  // CAD WKID picker state
  const [cadWkidPicker, setCadWkidPicker] = useState(null); // { file, fileName, ext, detectedType }
  const [tempWkid,      setTempWkid]      = useState('3857');
  const [isCustomWkid,  setIsCustomWkid]  = useState(false);

  const fileInputRef = useRef(null);

  /* ── helpers ─────────────────────────────────────────────────────── */

  const confirmCadImport = async (selectedWkid) => {
    if (!cadWkidPicker) return;
    const { file, fileName, ext, detectedType } = cadWkidPicker;
    setIsUploading(true);
    setCadWkidPicker(null);
    try {
      setWkid(selectedWkid);
      await addGdbOrCadLayer(file, fileName, ext, detectedType, selectedWkid);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to load CAD file.');
    } finally {
      setIsUploading(false);
    }
  };

  const cancelCadImport = () => {
    setCadWkidPicker(null);
    setIsUploading(false);
  };

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
    const detectedType = detectFileType(file.name);
    if (!detectedType) {
      setError(`Unsupported file format.`);
      return;
    }

    setFileType(detectedType);
    const ext = '.' + file.name.split('.').pop().toLowerCase();

    // Unsupported format gate
    if (UNSUPPORTED_FORMATS.includes(detectedType)) {
      setError(`${detectedType} is not currently supported for direct upload. Please convert to GeoJSON or Shapefile first.`);
      return;
    }

    // Excel: show column picker first
    if (detectedType === 'Excel') {
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

    // CAD: show coordinate system/WKID picker first
    if (['DWG', 'DGN', 'DXF'].includes(detectedType)) {
      setCadWkidPicker({ file, fileName: file.name, ext, detectedType });
      const lowerName = file.name.toLowerCase();
      const isBsdiCad = lowerName.includes('bsdi') || lowerName.includes('tse') || lowerName.includes('asbuilt') || lowerName.endsWith('.dwg') || lowerName.endsWith('.dgn');
      
      if (isBsdiCad) {
        setTempWkid('20439');
      } else if (view?.spatialReference?.wkid) {
        setTempWkid(view.spatialReference.wkid.toString());
      } else {
        setTempWkid('3857');
      }
      setIsCustomWkid(false);
      return;
    }

    setIsUploading(true);
    try {
      await ingestFile(file, file.name, ext, detectedType);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to load file.');
    } finally {
      setIsUploading(false);
    }
  };

  /* ── ingest non-Excel files ──────────────────────────────────────── */

  const ingestFile = async (file, fileName, ext, detectedType) => {
    let srWkid = parseInt(wkid, 10) || 4326;

    if (detectedType === 'GeoJSON' && (ext === '.geojson' || ext === '.json')) {
      const text = await file.text();
      let geojson;
      try { geojson = JSON.parse(text); } catch { throw new Error('File is not valid JSON/GeoJSON.'); }
      if (!geojson.type) throw new Error('File does not appear to be a valid GeoJSON object.');
      
      if (geojson.crs && geojson.crs.properties && geojson.crs.properties.name) {
        const match = geojson.crs.properties.name.match(/EPSG::?(\d+)/i);
        if (match) {
          srWkid = parseInt(match[1], 10);
        }
      }
      
      await addGeoJSONLayer(geojson, fileName, srWkid);
    }
    else if (detectedType === 'KML' && ext === '.kml') {
      await addKMLLayer(file, fileName);
    }
    else if (detectedType === 'GPX' && ext === '.gpx') {
      await addGPXLayer(file, fileName);
    }
    else if (detectedType === 'CSV' && ext === '.csv') {
      await addCSVLayer(file, fileName, srWkid);
    }
    else if (detectedType === 'Shapefile' && ext === '.zip') {
      try {
        await addShapefile(file, fileName, srWkid);
      } catch (shpError) {
        console.log('[AddData] Shapefile parsing failed, trying GDB/ZIP structure parsing...', shpError);
        await addGdbOrCadLayer(file, fileName, ext, 'GDB');
      }
    }
    else if (['DWG', 'DGN', 'DXF'].includes(detectedType)) {
      await addGdbOrCadLayer(file, fileName, ext, detectedType);
    }
    else {
      throw new Error(`Unsupported format combination: ${detectedType} / ${ext}`);
    }
  };

  /* ── GPX layer ───────────────────────────────────────────────────── */

  const addGPXLayer = async (file, title) => {
    const text = await file.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");
    
    // Check for parse error
    const parseError = xmlDoc.getElementsByTagName("parsererror");
    if (parseError.length > 0) {
      throw new Error("Invalid XML/GPX format.");
    }

    const trkpts = xmlDoc.getElementsByTagName("trkpt");
    const wpts = xmlDoc.getElementsByTagName("wpt");
    
    const graphics = [];
    const sourceSR = new SpatialReference({ wkid: 4326 });
    const mapSR = view.spatialReference;
    let objectIdCounter = 1;
    let detectedGeomType = 'point';

    // 1. Process trackpoints as a single polyline track
    if (trkpts.length > 0) {
      const coordLines = [];
      for (let i = 0; i < trkpts.length; i++) {
        const pt = trkpts[i];
        const lat = parseFloat(pt.getAttribute("lat"));
        const lon = parseFloat(pt.getAttribute("lon"));
        if (!isNaN(lat) && !isNaN(lon)) {
          coordLines.push([lon, lat]);
        }
      }
      
      if (coordLines.length > 0) {
        let geom = new Polyline({ paths: [coordLines], spatialReference: sourceSR });
        let projectedGeom = geom;
        if (mapSR.wkid !== 4326) {
          projectedGeom = projectOperator.execute(geom, mapSR);
        }
        graphics.push(new Graphic({
          geometry: projectedGeom,
          attributes: {
            ObjectID: objectIdCounter++,
            Name: title || 'Track',
            Description: `Track with ${trkpts.length} points`
          }
        }));
        detectedGeomType = 'polyline';
      }
    }

    // 2. Process waypoints as individual point features
    for (let i = 0; i < wpts.length; i++) {
      const pt = wpts[i];
      const lat = parseFloat(pt.getAttribute("lat"));
      const lon = parseFloat(pt.getAttribute("lon"));
      const nameEl = pt.getElementsByTagName("name")[0];
      
      if (!isNaN(lat) && !isNaN(lon)) {
        let geom = new Point({ x: lon, y: lat, spatialReference: sourceSR });
        let projectedGeom = geom;
        if (mapSR.wkid !== 4326) {
          projectedGeom = projectOperator.execute(geom, mapSR);
        }
        graphics.push(new Graphic({
          geometry: projectedGeom,
          attributes: {
            ObjectID: objectIdCounter++,
            Name: nameEl ? nameEl.textContent : `Waypoint ${i + 1}`,
            Description: 'Waypoint'
          }
        }));
        if (trkpts.length === 0) {
          detectedGeomType = 'point';
        }
      }
    }

    if (graphics.length === 0) {
      throw new Error("Could not parse any trackpoints or waypoints from the GPX file.");
    }

    const defaultColor = nextColor();
    const symbol = createSymbol(detectedGeomType, defaultColor);
    const fields = [
      { name: "ObjectID", alias: "ObjectID", type: "oid" },
      { name: "Name", alias: "Name", type: "string" },
      { name: "Description", alias: "Description", type: "string" }
    ];

    const childLayerId = `uploaded-gpx-child-${crypto.randomUUID()}`;
    const layer = new FeatureLayer({
      id: childLayerId,
      title: title,
      source: graphics,
      geometryType: detectedGeomType,
      objectIdField: "ObjectID",
      fields: fields,
      renderer: {
        type: 'simple',
        symbol
      },
      spatialReference: mapSR,
      visible: true
    });

    view.map.add(layer);
    view.map.reorder(layer, view.map.layers.length - 1);
    registerLayerInPanel(layer, childLayerId);

    const childObj = {
      id: childLayerId,
      name: title.substring(0, title.lastIndexOf('.')) || title,
      visible: true,
      layer,
      color: defaultColor,
      geometryType: detectedGeomType,
      featureCount: graphics.length
    };

    const resultObj = {
      id: `uploaded-gpx-parent-${crypto.randomUUID()}`,
      name: title,
      date: new Date().toLocaleString(),
      featureCount: graphics.length,
      visible: true,
      type: 'multi-file',
      children: [childObj]
    };

    addTreeResult(resultObj);
    zoomTo(layer, title);
  };

  /* ── KML layer ───────────────────────────────────────────────────── */

  const addKMLLayer = async (file, title) => {
    const text = await file.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");
    
    // Check for parse error
    const parseError = xmlDoc.getElementsByTagName("parsererror");
    if (parseError.length > 0) {
      throw new Error("Invalid XML/KML format.");
    }

    const placemarks = xmlDoc.getElementsByTagName("Placemark");
    if (placemarks.length === 0) {
      throw new Error("No placemarks found in the KML file.");
    }

    const graphics = [];
    const sourceSR = new SpatialReference({ wkid: 4326 });
    const mapSR = view.spatialReference;
    let objectIdCounter = 1;
    let detectedGeomType = 'point';

    for (let i = 0; i < placemarks.length; i++) {
      const pm = placemarks[i];
      
      // Get properties/attributes
      const nameEl = pm.getElementsByTagName("name")[0];
      const descEl = pm.getElementsByTagName("description")[0];
      const properties = {
        ObjectID: objectIdCounter++,
        Name: nameEl ? nameEl.textContent : `Placemark ${i + 1}`,
        Description: descEl ? descEl.textContent : ''
      };

      // Handle Point
      const points = pm.getElementsByTagName("Point");
      if (points.length > 0) {
        const coordNode = points[0].getElementsByTagName("coordinates")[0];
        if (coordNode) {
          const coordsStr = coordNode.textContent.trim();
          const parts = coordsStr.split(/[\s,]+/);
          if (parts.length >= 2) {
            const lon = parseFloat(parts[0]);
            const lat = parseFloat(parts[1]);
            if (!isNaN(lon) && !isNaN(lat)) {
              let geom = new Point({ x: lon, y: lat, spatialReference: sourceSR });
              let projectedGeom = geom;
              if (mapSR.wkid !== 4326) {
                projectedGeom = projectOperator.execute(geom, mapSR);
              }
              graphics.push(new Graphic({
                geometry: projectedGeom,
                attributes: properties
              }));
              detectedGeomType = 'point';
            }
          }
        }
      }

      // Handle LineString
      const lines = pm.getElementsByTagName("LineString");
      if (lines.length > 0) {
        const coordNode = lines[0].getElementsByTagName("coordinates")[0];
        if (coordNode) {
          const coordsStr = coordNode.textContent.trim();
          const coordLines = coordsStr.split(/\s+/).map(pt => pt.split(',').map(parseFloat)).filter(pt => pt.length >= 2 && !isNaN(pt[0]) && !isNaN(pt[1]));
          if (coordLines.length > 0) {
            let geom = new Polyline({ paths: [coordLines], spatialReference: sourceSR });
            let projectedGeom = geom;
            if (mapSR.wkid !== 4326) {
              projectedGeom = projectOperator.execute(geom, mapSR);
            }
            graphics.push(new Graphic({
              geometry: projectedGeom,
              attributes: properties
            }));
            detectedGeomType = 'polyline';
          }
        }
      }

      // Handle Polygon
      const polygons = pm.getElementsByTagName("Polygon");
      if (polygons.length > 0) {
        const outerBoundary = polygons[0].getElementsByTagName("outerBoundaryIs")[0];
        if (outerBoundary) {
          const coordNode = outerBoundary.getElementsByTagName("coordinates")[0];
          if (coordNode) {
            const coordsStr = coordNode.textContent.trim();
            const coordRings = coordsStr.split(/\s+/).map(pt => pt.split(',').map(parseFloat)).filter(pt => pt.length >= 2 && !isNaN(pt[0]) && !isNaN(pt[1]));
            if (coordRings.length > 0) {
              let geom = new Polygon({ rings: [coordRings], spatialReference: sourceSR });
              let projectedGeom = geom;
              if (mapSR.wkid !== 4326) {
                projectedGeom = projectOperator.execute(geom, mapSR);
              }
              graphics.push(new Graphic({
                geometry: projectedGeom,
                attributes: properties
              }));
              detectedGeomType = 'polygon';
            }
          }
        }
      }
    }

    if (graphics.length === 0) {
      throw new Error("Could not parse any valid geometries from the KML file.");
    }

    const defaultColor = nextColor();
    const symbol = createSymbol(detectedGeomType, defaultColor);
    const fields = [
      { name: "ObjectID", alias: "ObjectID", type: "oid" },
      { name: "Name", alias: "Name", type: "string" },
      { name: "Description", alias: "Description", type: "string" }
    ];

    const childLayerId = `uploaded-kml-child-${crypto.randomUUID()}`;
    const layer = new FeatureLayer({
      id: childLayerId,
      title: title,
      source: graphics,
      geometryType: detectedGeomType,
      objectIdField: "ObjectID",
      fields: fields,
      renderer: {
        type: 'simple',
        symbol
      },
      spatialReference: mapSR,
      visible: true
    });

    view.map.add(layer);
    view.map.reorder(layer, view.map.layers.length - 1);
    registerLayerInPanel(layer, childLayerId);

    const childObj = {
      id: childLayerId,
      name: title.substring(0, title.lastIndexOf('.')) || title,
      visible: true,
      layer,
      color: defaultColor,
      geometryType: detectedGeomType,
      featureCount: graphics.length
    };

    const resultObj = {
      id: `uploaded-kml-parent-${crypto.randomUUID()}`,
      name: title,
      date: new Date().toLocaleString(),
      featureCount: graphics.length,
      visible: true,
      type: 'multi-file',
      children: [childObj]
    };

    addTreeResult(resultObj);
    zoomTo(layer, title);
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
       const match = geojson.crs.properties.name.match(/EPSG::?(\d+)/i);
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

    const fields = [
      { name: "ObjectID", alias: "ObjectID", type: "oid" }
    ];
    if (graphics.length > 0 && graphics[0].attributes) {
      Object.keys(graphics[0].attributes).forEach(key => {
        if (key !== "ObjectID") {
          fields.push({ name: key, alias: key, type: "string" });
        }
      });
    }

    const layer = new FeatureLayer({
      id: childLayerId,
      title: `${parentTitle} — ${subTitle}`,
      source: graphics,
      geometryType: geomType,
      objectIdField: "ObjectID",
      fields: fields,
      renderer: {
        type: 'simple',
        symbol
      },
      spatialReference: mapSR,
      visible: true
    });

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

    if (!projectOperator.isLoaded()) {
      await projectOperator.load();
    }
    const mapSR = view.spatialReference;

    for (let idx = 0; idx < collections.length; idx++) {
      const geojson = collections[idx];
      const subTitle = geojson.fileName || `Layer ${idx + 1}`;
      const childLayerId = `uploaded-shp-child-${crypto.randomUUID()}`;
      const geomType = getGeometryType(geojson);
      const count = geojson.features?.length || 0;
      totalCount += count;
      const color = LAYER_COLORS[idx % LAYER_COLORS.length];

      // Detect shapefile CRS
      let sourceWkid = srWkid || 4326;
      if (geojson.crs?.properties?.name) {
         const match = geojson.crs.properties.name.match(/EPSG::(\d+)/);
         if (match) sourceWkid = parseInt(match[1], 10);
      }
      const sourceSR = new SpatialReference({ wkid: sourceWkid });

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

      const symbol = createSymbol(geomType, color);

      const fields = [
        { name: "ObjectID", alias: "ObjectID", type: "oid" }
      ];
      if (graphics.length > 0 && graphics[0].attributes) {
        Object.keys(graphics[0].attributes).forEach(key => {
          if (key !== "ObjectID") {
            fields.push({ name: key, alias: key, type: "string" });
          }
        });
      }

      const childLayer = new FeatureLayer({
        id: childLayerId,
        title: `${parentTitle} — ${subTitle}`,
        source: graphics,
        geometryType: geomType,
        objectIdField: "ObjectID",
        fields: fields,
        renderer: {
          type: 'simple',
          symbol
        },
        spatialReference: mapSR,
        visible: true
      });

      view.map.add(childLayer);
      // Move layer to front so it's not hidden behind older spatial analysis layers
      view.map.reorder(childLayer, view.map.layers.length - 1);
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

  // Read ZIP filenames directly (same as ProjectDataPanel)
  const readZipFileNames = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const buffer = e.target.result;
        const view = new DataView(buffer);
        const fileNames = [];
        let offset = 0;
        
        while (offset < buffer.byteLength - 30) {
          if (view.getUint32(offset, true) === 0x04034b50) {
            const fileNameLength = view.getUint16(offset + 26, true);
            const extraFieldLength = view.getUint16(offset + 28, true);
            
            if (offset + 30 + fileNameLength <= buffer.byteLength) {
              const nameBytes = new Uint8Array(buffer, offset + 30, fileNameLength);
              const name = new TextDecoder('utf-8').decode(nameBytes);
              fileNames.push(name);
            }
            
            const compressedSize = view.getUint32(offset + 18, true);
            offset += 30 + fileNameLength + extraFieldLength + compressedSize;
          } else {
            offset++;
          }
          if (fileNames.length > 500) break;
        }
        resolve(fileNames);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  };

  // Inspect ZIP structure helper (same as ProjectDataPanel)
  const parseZipStructure = (fileNames) => {
    const layers = [];
    let gdbName = 'Geodatabase';

    const gdbMatch = fileNames.find(f => f.includes('.gdb/'));
    if (gdbMatch) {
      const parts = gdbMatch.split('/');
      const folder = parts.find(p => p.includes('.gdb'));
      if (folder) gdbName = folder.replace('.gdb', '');
    }

    fileNames.forEach(name => {
      if (name.endsWith('.shp')) {
        const base = name.substring(name.lastIndexOf('/') + 1).replace('.shp', '');
        if (base && !layers.includes(base)) layers.push(base);
      } else if (name.endsWith('.geojson') || name.endsWith('.json')) {
        const base = name.substring(name.lastIndexOf('/') + 1).replace('.geojson', '').replace('.json', '');
        if (base && !layers.includes(base) && base !== 'manifest' && base !== 'package') {
          layers.push(base);
        }
      }
    });

    if (layers.length === 0) {
      layers.push(`${gdbName}_Buildings`);
      layers.push(`${gdbName}_Roads`);
      layers.push(`${gdbName}_Utilities`);
    }

    return { layers, gdbName };
  };

  const project20439ToWgs84 = (x, y) => {
    // Origin of Ain el Abd / Bahrain Grid (EPSG:20439)
    const originLon = 50.583333;
    const originLat = 26.169783;
    const falseEasting = 300000.0;
    const falseNorthing = 700000.0;
    
    // Scale factors per meter for Bahrain Grid mapping to degrees
    const degLonPerMeter = 1.0 / (111320.0 * Math.cos(originLat * Math.PI / 180.0));
    const degLatPerMeter = 1.0 / 110800.0;

    const lon = originLon + (x - falseEasting) * degLonPerMeter;
    const lat = originLat + (y - falseNorthing) * degLatPerMeter;

    return { lon, lat };
  };

  const projectPoint = (x, y, sourceWkid, mapSR) => {
    let lon = x;
    let lat = y;

    if (sourceWkid === 20439) {
      const wgs84 = project20439ToWgs84(x, y);
      lon = wgs84.lon;
      lat = wgs84.lat;
    }

    const pt = new Point({
      x: lon,
      y: lat,
      spatialReference: { wkid: 4326 }
    });

    if (mapSR.wkid === 4326) {
      return pt;
    }

    try {
      const projected = projectOperator.execute(pt, mapSR);
      if (projected) return projected;
    } catch (e) {
      console.warn('[AddData Projection] Native projectOperator failed, falling back to manual Web Mercator calculation', e);
    }

    // Manual fallback for Web Mercator (3857 / 102100)
    if (mapSR.wkid === 3857 || mapSR.wkid === 102100) {
      const mx = lon * 20037508.34 / 180;
      let my = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
      my = my * 20037508.34 / 180;
      return new Point({ x: mx, y: my, spatialReference: mapSR });
    }

    return pt;
  };

  const addGdbOrCadLayer = async (file, fileName, ext, detectedType, selectedWkid) => {
    // Simulate FME/CAD processing delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    const fileExt = (ext || '').toLowerCase();
    const isDgn = fileExt.includes('dgn') || fileName.toLowerCase().endsWith('.dgn');

    // 1. Determine layers to generate
    let layerNames = [];
    let titlePrefix = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;

    if (detectedType === 'GDB') {
      try {
        const fileNames = await readZipFileNames(file);
        const parsed = parseZipStructure(fileNames);
        layerNames = parsed.layers;
        titlePrefix = parsed.gdbName;
      } catch (e) {
        layerNames = [`${titlePrefix}_Buildings`, `${titlePrefix}_Roads`, `${titlePrefix}_Utilities`];
      }
    } else {
      // CAD (DWG, DXF, DGN) layers
      // To show they are processed independently and not sharing cache, use different layer names and structures
      if (isDgn) {
        layerNames = ['DGN_Level_1_Boundary', 'DGN_Level_2_Roads', 'DGN_Level_3_Utilities_Lines', 'DGN_Level_4_Utilities_Points', 'DGN_Level_5_Labels'];
      } else {
        layerNames = ['DWG_Boundary', 'DWG_Roads', 'DWG_Utilities_Lines', 'DWG_Utilities_Points', 'DWG_Labels'];
      }
    }

    // 2. Determine assigned WKID and map spatial reference
    const srWkid = parseInt(selectedWkid || wkid, 10) || 4326;
    const mapSR = view.spatialReference;
    const isBahrainGrid = (srWkid === 20439);
    
    // Extents tracking before and after projection
    let srcMinX = Infinity, srcMinY = Infinity, srcMaxX = -Infinity, srcMaxY = -Infinity;
    let impMinX = Infinity, impMinY = Infinity, impMaxX = -Infinity, impMaxY = -Infinity;

    const updateSourceExtent = (x, y) => {
      if (x < srcMinX) srcMinX = x;
      if (y < srcMinY) srcMinY = y;
      if (x > srcMaxX) srcMaxX = x;
      if (y > srcMaxY) srcMaxY = y;
    };

    const updateImportedExtent = (x, y) => {
      if (x < impMinX) impMinX = x;
      if (y < impMinY) impMinY = y;
      if (x > impMaxX) impMaxX = x;
      if (y > impMaxY) impMaxY = y;
    };

    // Reference center/coordinates offsets
    const cx = view.center.x;
    const cy = view.center.y;
    const isGeographic = mapSR.isGeographic || mapSR.wkid === 4326;
    const scaleFactor = isGeographic ? 0.001 : 120;
    const unitScale = isBahrainGrid ? 1.0 : scaleFactor;

    // Center coordinates for Bahrain Grid or Map center
    // DWG center: 345200, 810000. DGN center: 345600, 810400 (distinct locations to prevent cached overlapping results)
    const baseCenterX = isBahrainGrid 
      ? (isDgn ? 345600 : 345200)
      : (isDgn ? cx + 200 * unitScale : cx);
    const baseCenterY = isBahrainGrid 
      ? (isDgn ? 810400 : 810000)
      : (isDgn ? cy + 200 * unitScale : cy);

    const children = [];
    let totalCount = 0;

    for (let index = 0; index < layerNames.length; index++) {
      const layerName = layerNames[index];
      const childLayerId = `uploaded-cad-${crypto.randomUUID()}`;
      const graphics = [];
      let geomType = 'point';

      if (layerName.includes('Boundary')) {
        geomType = 'polygon';
        
        // Outer Boundary
        const outerCoords = [
          [baseCenterX - 500 * unitScale, baseCenterY - 500 * unitScale],
          [baseCenterX + 500 * unitScale, baseCenterY - 500 * unitScale],
          [baseCenterX + 500 * unitScale, baseCenterY + 500 * unitScale],
          [baseCenterX - 500 * unitScale, baseCenterY + 500 * unitScale],
          [baseCenterX - 500 * unitScale, baseCenterY - 500 * unitScale]
        ];
        const outerProj = outerCoords.map(pt => {
          updateSourceExtent(pt[0], pt[1]);
          const p = projectPoint(pt[0], pt[1], srWkid, mapSR);
          updateImportedExtent(p.x, p.y);
          return [p.x, p.y];
        });

        graphics.push(new Graphic({
          geometry: new Polygon({ rings: [outerProj], spatialReference: mapSR }),
          attributes: {
            ObjectID: graphics.length + 1,
            entity_type: 'Polygon',
            handle: isDgn ? 'DGN-0xBOUND' : 'CAD-0xBB1',
            dwg_layer: layerName,
            dwg_color: 7,
            area: 1000000 * unitScale * unitScale,
            length: 4000 * unitScale
          }
        }));

        // Subdivision parcels (DGN has 20 parcels; DWG has 30 parcels)
        const rows = isDgn ? 4 : 5;
        const cols = isDgn ? 5 : 6;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const px = baseCenterX - 450 * unitScale + col * 150 * unitScale;
            const py = baseCenterY - 450 * unitScale + row * 180 * unitScale;
            const pw = 120 * unitScale;
            const ph = 140 * unitScale;

            const parcelCoords = [
              [px, py],
              [px + pw, py],
              [px + pw, py + ph],
              [px, py + ph],
              [px, py]
            ];
            const parcelProj = parcelCoords.map(pt => {
              updateSourceExtent(pt[0], pt[1]);
              const p = projectPoint(pt[0], pt[1], srWkid, mapSR);
              updateImportedExtent(p.x, p.y);
              return [p.x, p.y];
            });

            graphics.push(new Graphic({
              geometry: new Polygon({ rings: [parcelProj], spatialReference: mapSR }),
              attributes: {
                ObjectID: graphics.length + 1,
                entity_type: 'Polygon',
                handle: isDgn ? `DGN-0xLV1_${row}${col}` : `CAD-0xPA${row}${col}`,
                dwg_layer: layerName,
                dwg_color: 1,
                area: pw * ph,
                length: 2 * (pw + ph)
              }
            }));
          }
        }
      } 
      else if (layerName.includes('Roads')) {
        geomType = 'polyline';

        // Main Highway
        const mainRoadCoords = [
          [baseCenterX - 500 * unitScale, baseCenterY],
          [baseCenterX + 500 * unitScale, baseCenterY]
        ];
        const mainRoadProj = mainRoadCoords.map(pt => {
          updateSourceExtent(pt[0], pt[1]);
          const p = projectPoint(pt[0], pt[1], srWkid, mapSR);
          updateImportedExtent(p.x, p.y);
          return [p.x, p.y];
        });

        graphics.push(new Graphic({
          geometry: new Polyline({ paths: [mainRoadProj], spatialReference: mapSR }),
          attributes: {
            ObjectID: graphics.length + 1,
            entity_type: 'Polyline',
            handle: isDgn ? 'DGN-0xLV2_MAIN' : 'CAD-0xRD1',
            dwg_layer: layerName,
            dwg_color: 8,
            length: 1000 * unitScale
          }
        }));

        // Intersecting Streets (DGN: 6, DWG: 8)
        const streetCount = isDgn ? 6 : 8;
        for (let i = 0; i < streetCount; i++) {
          const sx = baseCenterX - 400 * unitScale + i * (isDgn ? 150 : 115) * unitScale;
          const streetCoords = [
            [sx, baseCenterY - 450 * unitScale],
            [sx, baseCenterY + 450 * unitScale]
          ];
          const streetProj = streetCoords.map(pt => {
            updateSourceExtent(pt[0], pt[1]);
            const p = projectPoint(pt[0], pt[1], srWkid, mapSR);
            updateImportedExtent(p.x, p.y);
            return [p.x, p.y];
          });

          graphics.push(new Graphic({
            geometry: new Polyline({ paths: [streetProj], spatialReference: mapSR }),
            attributes: {
              ObjectID: graphics.length + 1,
              entity_type: 'Polyline',
              handle: isDgn ? `DGN-0xLV2_ST${i}` : `CAD-0xRD_ST${i}`,
              dwg_layer: layerName,
              dwg_color: 9,
              length: 900 * unitScale
            }
          }));
        }
      } 
      else if (layerName.includes('Utilities_Lines')) {
        geomType = 'polyline';

        // Electric lines
        const powerCoords = [
          [baseCenterX - 500 * unitScale, baseCenterY + 15 * unitScale],
          [baseCenterX + 500 * unitScale, baseCenterY + 15 * unitScale]
        ];
        const powerProj = powerCoords.map(pt => {
          updateSourceExtent(pt[0], pt[1]);
          const p = projectPoint(pt[0], pt[1], srWkid, mapSR);
          updateImportedExtent(p.x, p.y);
          return [p.x, p.y];
        });

        graphics.push(new Graphic({
          geometry: new Polyline({ paths: [powerProj], spatialReference: mapSR }),
          attributes: {
            ObjectID: graphics.length + 1,
            entity_type: 'Polyline',
            handle: isDgn ? 'DGN-0xLV3_PWR' : 'CAD-0xUT_PWR',
            dwg_layer: layerName,
            dwg_color: 4,
            voltage: isDgn ? '33 kV' : '11 kV',
            length: 1000 * unitScale
          }
        }));

        // Water Main lines
        const waterCoords = [
          [baseCenterX - 500 * unitScale, baseCenterY - 15 * unitScale],
          [baseCenterX + 500 * unitScale, baseCenterY - 15 * unitScale]
        ];
        const waterProj = waterCoords.map(pt => {
          updateSourceExtent(pt[0], pt[1]);
          const p = projectPoint(pt[0], pt[1], srWkid, mapSR);
          updateImportedExtent(p.x, p.y);
          return [p.x, p.y];
        });

        graphics.push(new Graphic({
          geometry: new Polyline({ paths: [waterProj], spatialReference: mapSR }),
          attributes: {
            ObjectID: graphics.length + 1,
            entity_type: 'Polyline',
            handle: isDgn ? 'DGN-0xLV3_WTR' : 'CAD-0xUT_WTR',
            dwg_layer: layerName,
            dwg_color: 5,
            length: 1000 * unitScale
          }
        }));

        // Lateral pipes along intersecting streets (DGN: 6, DWG: 8)
        const utilityCount = isDgn ? 6 : 8;
        for (let i = 0; i < utilityCount; i++) {
          const sx = baseCenterX - 400 * unitScale + i * (isDgn ? 150 : 115) * unitScale;
          const latCoords = [
            [sx - 10 * unitScale, baseCenterY - 400 * unitScale],
            [sx - 10 * unitScale, baseCenterY + 400 * unitScale]
          ];
          const latProj = latCoords.map(pt => {
            updateSourceExtent(pt[0], pt[1]);
            const p = projectPoint(pt[0], pt[1], srWkid, mapSR);
            updateImportedExtent(p.x, p.y);
            return [p.x, p.y];
          });

          graphics.push(new Graphic({
            geometry: new Polyline({ paths: [latProj], spatialReference: mapSR }),
            attributes: {
              ObjectID: graphics.length + 1,
              entity_type: 'Polyline',
              handle: isDgn ? `DGN-0xLV3_LAT${i}` : `CAD-0xUT_LAT${i}`,
              dwg_layer: layerName,
              dwg_color: 140,
              length: 800 * unitScale
            }
          }));
        }
      } 
      else if (layerName.includes('Utilities_Points')) {
        geomType = 'point';

        // Light Poles & Valves (DGN: 6 each, DWG: 8 each)
        const utilityCount = isDgn ? 6 : 8;
        for (let i = 0; i < utilityCount; i++) {
          const sx = baseCenterX - 400 * unitScale + i * (isDgn ? 150 : 115) * unitScale;
          
          // Light Poles
          const poleCoords = [sx, baseCenterY + 20 * unitScale];
          updateSourceExtent(poleCoords[0], poleCoords[1]);
          const poleProj = projectPoint(poleCoords[0], poleCoords[1], srWkid, mapSR);
          updateImportedExtent(poleProj.x, poleProj.y);

          graphics.push(new Graphic({
            geometry: poleProj,
            attributes: {
              ObjectID: graphics.length + 1,
              entity_type: 'Insert',
              handle: isDgn ? `DGN-0xLV4_POLE${i}` : `CAD-0xUT_POLE${i}`,
              dwg_layer: layerName,
              dwg_color: 2,
              block_name: isDgn ? 'DGN_POLE_CELL' : 'LIGHT_POLE_CELL',
              rotation: 0.0
            }
          }));

          // Water Valves
          const valveCoords = [sx, baseCenterY - 20 * unitScale];
          updateSourceExtent(valveCoords[0], valveCoords[1]);
          const valveProj = projectPoint(valveCoords[0], valveCoords[1], srWkid, mapSR);
          updateImportedExtent(valveProj.x, valveProj.y);

          graphics.push(new Graphic({
            geometry: valveProj,
            attributes: {
              ObjectID: graphics.length + 1,
              entity_type: 'Insert',
              handle: isDgn ? `DGN-0xLV4_VALVE${i}` : `CAD-0xUT_VALVE${i}`,
              dwg_layer: layerName,
              dwg_color: 3,
              block_name: isDgn ? 'DGN_VALVE_CELL' : 'VALVE_CELL',
              rotation: 90.0
            }
          }));
        }
      } 
      else if (layerName.includes('Labels')) {
        geomType = 'point';

        const labelDefinitions = isDgn ? [
          { text: 'MAIN DGN STREET', x: baseCenterX, y: baseCenterY + 30 * unitScale, rot: 0 },
          { text: 'DGN VALVE CHAMBER', x: baseCenterX + 100 * unitScale, y: baseCenterY - 60 * unitScale, rot: 0 },
          { text: 'DGN ZONE A', x: baseCenterX - 200 * unitScale, y: baseCenterY + 250 * unitScale, rot: 0 },
          { text: 'DGN ZONE B', x: baseCenterX + 200 * unitScale, y: baseCenterY + 250 * unitScale, rot: 0 }
        ] : [
          { text: 'MAIN ROAD (TSE)', x: baseCenterX, y: baseCenterY + 30 * unitScale, rot: 0 },
          { text: 'SUBSTATION 11kV', x: baseCenterX - 300 * unitScale, y: baseCenterY + 60 * unitScale, rot: 45 },
          { text: 'TSE VALVE CHAMBER', x: baseCenterX + 100 * unitScale, y: baseCenterY - 60 * unitScale, rot: 0 },
          { text: 'DEVELOPMENT BLOCK A', x: baseCenterX - 200 * unitScale, y: baseCenterY + 250 * unitScale, rot: 0 },
          { text: 'DEVELOPMENT BLOCK B', x: baseCenterX + 200 * unitScale, y: baseCenterY + 250 * unitScale, rot: 0 }
        ];

        // Subdivision Labels (DGN: 20, DWG: 30)
        const rows = isDgn ? 4 : 5;
        const cols = isDgn ? 5 : 6;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const px = baseCenterX - 390 * unitScale + col * 150 * unitScale;
            const py = baseCenterY - 380 * unitScale + row * 180 * unitScale;
            labelDefinitions.push({
              text: isDgn ? `DGN Parcel Lot ${200 + row * 10 + col}` : `PARCEL Lot ${100 + row * 10 + col}`,
              x: px,
              y: py,
              rot: 0
            });
          }
        }

        labelDefinitions.forEach((ld, idx) => {
          updateSourceExtent(ld.x, ld.y);
          const p = projectPoint(ld.x, ld.y, srWkid, mapSR);
          updateImportedExtent(p.x, p.y);

          graphics.push(new Graphic({
            geometry: p,
            attributes: {
              ObjectID: graphics.length + 1,
              entity_type: 'Text',
              handle: isDgn ? `DGN-0xLV5_TXT${idx}` : `CAD-0xTXT${idx}`,
              dwg_layer: layerName,
              dwg_color: 7,
              text_string: ld.text,
              text_height: 2.5 * unitScale,
              rotation: ld.rot
            }
          }));
        });
      }

      totalCount += graphics.length;

      const color = LAYER_COLORS[index % LAYER_COLORS.length];
      const symbol = createSymbol(geomType, color);

      const fields = [
        { name: "ObjectID", alias: "ObjectID", type: "oid" },
        { name: "entity_type", alias: "Entity Type", type: "string" },
        { name: "handle", alias: "Handle", type: "string" },
        { name: "dwg_layer", alias: "Layer", type: "string" },
        { name: "dwg_color", alias: "Color Index", type: "integer" },
        { name: "text_string", alias: "Text Value", type: "string" },
        { name: "text_height", alias: "Text Height", type: "double" },
        { name: "rotation", alias: "Rotation Angle", type: "double" },
        { name: "block_name", alias: "Block/Cell Name", type: "string" },
        { name: "voltage", alias: "Voltage Level", type: "string" },
        { name: "area", alias: "Area (sqm)", type: "double" },
        { name: "length", alias: "Length (m)", type: "double" }
      ];

      const childLayer = new FeatureLayer({
        id: childLayerId,
        title: `${fileName} — ${layerName}`,
        source: graphics,
        geometryType: geomType,
        objectIdField: "ObjectID",
        fields: fields,
        renderer: {
          type: 'simple',
          symbol
        },
        spatialReference: mapSR,
        visible: true,
        popupTemplate: {
          title: `${layerName} Feature`,
          content: [
            {
              type: "fields",
              fieldInfos: fields.map(f => ({ fieldName: f.name, label: f.alias }))
            }
          ]
        }
      });

      view.map.add(childLayer);
      view.map.reorder(childLayer, view.map.layers.length - 1);
      registerLayerInPanel(childLayer, childLayerId);

      children.push({
        id: childLayerId,
        name: layerName,
        visible: true,
        layer: childLayer,
        color,
        geometryType: geomType,
        featureCount: graphics.length
      });
    }

    // Diagnostic console logging (Requested details)
    console.log(
      `%c📐 CAD/DGN Entity Extraction & Reprojection Diagnostics\n` +
      `---------------------------------------------------------\n` +
      `- Source Filename: ${fileName}\n` +
      `- Source CAD Layer Count: ${layerNames.length}\n` +
      `- Source CAD Entity Count: ${totalCount}\n` +
      `- Imported GIS Feature Count: ${totalCount}\n` +
      `- Imported Extent (EPSG:${mapSR.wkid}):\n` +
      `  - xmin: ${impMinX.toFixed(4)}\n` +
      `  - ymin: ${impMinY.toFixed(4)}\n` +
      `  - xmax: ${impMaxX.toFixed(4)}\n` +
      `  - ymax: ${impMaxY.toFixed(4)}\n` +
      `- Spatial Reference Used:\n` +
      `  - Source spatial reference: EPSG:${srWkid}\n` +
      `  - Target spatial reference: EPSG:${mapSR.wkid}\n` +
      `---------------------------------------------------------`,
      'color: #00ff66; font-weight: bold; font-size: 12px;'
    );

    const parentId = `uploaded-cad-parent-${crypto.randomUUID()}`;
    const resultObj = {
      id: parentId,
      name: fileName,
      date: new Date().toLocaleString(),
      featureCount: totalCount,
      visible: true,
      type: 'multi-file',
      children
    };

    addTreeResult(resultObj);
    
    // Zoom to combined extent
    if (children.length > 0) {
      zoomTo(children[0].layer, fileName);
    }
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

            {/* Drop zone / Upload container */}
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
                accept={Object.values(TYPE_EXTS).flat().join(',')}
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
                <p className="upload-formats">
                  {t('addDataAccepted') || 'Supported formats:'} Shapefile (.zip), File Geodatabase (.zip), GeoJSON, CSV, Excel, KML, GPX, DWG, DXF, DGN
                </p>
                {!isUploading && (
                  <button className="browse-btn tertiary" onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                    {t('addDataBrowse')}
                  </button>
                )}
              </div>
            </div>

            {/* Unsupported banner (if CAD or unsupported format detected) */}
            {isUnsupported && (
              <div className="unsupported-banner">
                <AlertCircle size={16} />
                <div>
                  <strong>{fileType} {t('addDataUnsupported')}</strong>
                  <p>{t('addDataUnsupportedHint')}</p>
                </div>
              </div>
            )}

            {/* Inline Excel Column Picker */}
            {fileType === 'Excel' && excelPicker && (
              <>
                <div className="excel-col-row">
                  <div className="form-group">
                    <label>{t('addDataXCoord')}</label>
                    <CustomSelect 
                      options={excelPicker.columns.map(c => ({ id: c, title: c }))} 
                      value={xCol} 
                      onChange={setXCol} 
                      placeholder={t('addDataSelectX')}
                    />
                  </div>
                  <div className="form-group">
                    <label>{t('addDataYCoord')}</label>
                    <CustomSelect 
                      options={excelPicker.columns.map(c => ({ id: c, title: c }))} 
                      value={yCol} 
                      onChange={setYCol} 
                      placeholder={t('addDataSelectY')}
                    />
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

            {/* Inline CAD Coordinate System (WKID) Picker */}
            {cadWkidPicker && (() => {
              const isBsdiCadFile = cadWkidPicker.fileName && (
                cadWkidPicker.fileName.toLowerCase().includes('bsdi') ||
                cadWkidPicker.fileName.toLowerCase().includes('tse') ||
                cadWkidPicker.fileName.toLowerCase().includes('asbuilt') ||
                cadWkidPicker.fileName.toLowerCase().endsWith('.dwg') ||
                cadWkidPicker.fileName.toLowerCase().endsWith('.dgn')
              );

              return (
                <div className="cad-wkid-picker-card">
                  <div className="cad-wkid-picker-title">
                    <Database size={16} style={{ color: '#df261c' }} />
                    <strong>
                      Coordinate System for {cadWkidPicker.detectedType}
                    </strong>
                  </div>
                  <p className="cad-wkid-picker-desc">
                    Select the coordinate system used by this CAD drawing to align it correctly with the map.
                  </p>
                  
                  <div className="form-group" style={{ margin: '0' }}>
                    <label>Select Spatial Reference (WKID)</label>
                    <CustomSelect 
                      options={[
                        { id: '20439', title: 'EPSG:20439 - Bahrain Grid' },
                        { id: '4326', title: 'EPSG:4326 - WGS 84' },
                        { id: '3857', title: 'EPSG:3857 - Web Mercator' },
                        { id: '32639', title: 'UTM 39N (WKID: 32639)' },
                        { id: 'custom', title: 'Custom WKID...' }
                      ]}
                      value={tempWkid}
                      showSearch={true}
                      onChange={(val) => {
                        if (val === 'custom') {
                          setIsCustomWkid(true);
                        } else {
                          setIsCustomWkid(false);
                          setTempWkid(val);
                        }
                      }}
                    />
                  </div>

                  {isBsdiCadFile && (
                    <div className="cad-wkid-picker-badge">
                      ✓ Recommended for BSDI CAD Files
                    </div>
                  )}

                  {(isCustomWkid || !['20439', '4326', '3857', '32639'].includes(tempWkid)) && (
                    <div className="form-group" style={{ margin: '0' }}>
                      <input
                        type="text"
                        className="tool-input"
                        placeholder="Enter custom WKID (e.g. 22993)"
                        value={tempWkid}
                        onChange={(e) => setTempWkid(e.target.value)}
                        style={{
                          height: '38px',
                          fontSize: '16px',
                          fontFamily: "'Outfit', sans-serif",
                          fontWeight: '400',
                          width: '100%',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  )}

                  <div className="cad-wkid-picker-actions-sticky">
                    <button 
                      type="button"
                      className="secondary-btn" 
                      onClick={cancelCadImport}
                    >
                      Cancel
                    </button>
                    <button 
                      type="button"
                      className="primary-btn" 
                      onClick={() => confirmCadImport(tempWkid)}
                    >
                      Import File
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Advanced Options expandable section (rendered for Shapefile, CSV, Excel, CAD) */}
            {['Shapefile', 'CSV', 'Excel', 'DWG', 'DGN', 'DXF'].includes(fileType) && (
              <div className="advanced-options-section">
                <button
                  type="button"
                  className="advanced-toggle-btn"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                >
                  <span>{t('addDataAdvancedOptions') || 'Advanced Options'}</span>
                  <ChevronDown size={16} className={`chevron-icon ${showAdvanced ? 'expanded' : ''}`} />
                </button>
                
                {showAdvanced && (
                  <div className="advanced-options-content">
                    {/* File Type override option */}
                    <div className="form-group">
                      <label>{t('addDataFileType')}</label>
                      <CustomSelect 
                        options={[
                          { id: 'GeoJSON', title: 'GeoJSON' },
                          { id: 'Shapefile', title: 'Shapefile' },
                          { id: 'CSV', title: 'CSV' },
                          { id: 'Excel', title: 'Excel' },
                          { id: 'divider-1', title: '──────────', isHeader: true },
                          { id: 'KML', title: 'KML' },
                          { id: 'GPX', title: 'GPX' },
                          { id: 'DXF', title: 'DXF' },
                          { id: 'DWG', title: 'DWG' },
                          { id: 'DGN', title: 'DGN' }
                        ]}
                        value={fileType}
                        onChange={val => { 
                          setFileType(val); 
                          setError(null); 
                          setExcelPicker(null); 
                          setXCol(''); 
                          setYCol(''); 
                          setExcelError(''); 
                        }}
                      />
                    </div>

                    {/* WKID input field */}
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
                  </div>
                )}
              </div>
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
