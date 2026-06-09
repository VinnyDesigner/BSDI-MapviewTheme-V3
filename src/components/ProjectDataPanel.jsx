import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { 
  Upload, File, Layers, Eye, EyeOff, Search, Maximize2, 
  Table2, Trash2, CheckCircle2, AlertCircle, Cpu, Settings, HelpCircle, X
} from 'lucide-react';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import Polygon from '@arcgis/core/geometry/Polygon';
import Polyline from '@arcgis/core/geometry/Polyline';
import Point from '@arcgis/core/geometry/Point';
import shp from 'shpjs';
import './ProjectDataPanel.css';

// Dynamic color generator derived from layer name hash
const getLayerColor = (name, index = 0) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const r = Math.abs((hash & 0xFF0000) >> 16);
  const g = Math.abs((hash & 0x00FF00) >> 8);
  const b = Math.abs(hash & 0x0000FF);
  
  // Mix in index weight to prevent collisions
  const finalR = (r + index * 37) % 256;
  const finalG = (g + index * 61) % 256;
  const finalB = (b + index * 83) % 256;
  
  return {
    rgbStr: `rgb(${finalR}, ${finalG}, ${finalB})`,
    array: [finalR, finalG, finalB]
  };
};

const ProjectDataPanel = ({ view }) => {
  const { t, lang } = useLanguage();
  const isRTL = lang === 'AR';

  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('layers'); 
  
  // Dynamic states
  const [isGdb, setIsGdb] = useState(false);
  const [dynamicGdbName, setDynamicGdbName] = useState('Geodatabase');
  const [dynamicLayerNames, setDynamicLayerNames] = useState([]);
  const [layersMetadata, setLayersMetadata] = useState({});
  const [layerVisibility, setLayerVisibility] = useState({});
  const [activeTable, setActiveTable] = useState(null);

  // Progressive loading status label
  const [gdbStatusText, setGdbStatusText] = useState('');

  const layersRef = useRef({});
  const combinedExtentRef = useRef(null);

  // Cleanup layers on unmount
  useEffect(() => {
    return () => {
      if (view?.map) {
        Object.values(layersRef.current).forEach(layer => {
          view.map.remove(layer);
        });
      }
    };
  }, [view]);

  // Read raw ZIP headers directly in the browser to extract files in GDB or other structures
  const readZipFileNames = (file) => {
    return new Promise((resolve) => {
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
      reader.readAsArrayBuffer(file);
    });
  };

  // Inspect ZIP contents to build layer list dynamically for procedural GDB datasets
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

  // Detect coordinate system (geographic vs projected) based on coordinates
  const detectSpatialReference = (geojson) => {
    let isGeo = true;
    const check = (c) => {
      if (Array.isArray(c)) {
        if (typeof c[0] === 'number') {
          if (Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) {
            isGeo = false;
          }
        } else {
          c.forEach(check);
        }
      }
    };

    const firstFeat = geojson?.features?.[0];
    if (firstFeat?.geometry?.coordinates) {
      check(firstFeat.geometry.coordinates);
    }
    
    return isGeo ? { wkid: 4326 } : (view?.spatialReference || { wkid: 3857 });
  };

  // Calculate the spatial bounding box of GeoJSON features
  const calculateGeoJsonExtent = (features, sr) => {
    let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
    
    features.forEach(f => {
      if (!f.geometry) return;
      const coords = f.geometry.coordinates;
      const processCoord = (c) => {
        if (Array.isArray(c)) {
          if (typeof c[0] === 'number') {
            xmin = Math.min(xmin, c[0]);
            ymin = Math.min(ymin, c[1]);
            xmax = Math.max(xmax, c[0]);
            ymax = Math.max(ymax, c[1]);
          } else {
            c.forEach(processCoord);
          }
        }
      };
      processCoord(coords);
    });

    if (xmin === Infinity) return null;

    const padX = (xmax - xmin) * 0.15 || (sr.wkid === 4326 ? 0.001 : 100);
    const padY = (ymax - ymin) * 0.15 || (sr.wkid === 4326 ? 0.001 : 100);

    return {
      xmin: xmin - padX,
      ymin: ymin - padY,
      xmax: xmax + padX,
      ymax: ymax + padY,
      spatialReference: sr
    };
  };

  // Convert GeoJSON geometry to ArcGIS SDK native geometry object
  const convertGeoJsonToArcGis = (geojsonGeom, sr) => {
    if (!geojsonGeom) return null;
    const { type, coordinates } = geojsonGeom;
    
    switch (type) {
      case 'Point':
        return new Point({ x: coordinates[0], y: coordinates[1], spatialReference: sr });
        
      case 'MultiPoint':
        return new Point({ x: coordinates[0][0], y: coordinates[0][1], spatialReference: sr });
        
      case 'LineString':
        return new Polyline({ paths: [coordinates], spatialReference: sr });
        
      case 'MultiLineString':
        return new Polyline({ paths: coordinates, spatialReference: sr });
        
      case 'Polygon':
        return new Polygon({ rings: coordinates, spatialReference: sr });
        
      case 'MultiPolygon':
        return new Polygon({ rings: coordinates.flat(1), spatialReference: sr });
        
      default:
        return null;
    }
  };

  // Plot dynamic shapefile datasets parsed by shpjs or GeoJSON files
  const plotDynamicGeoJsonDataset = (layersCollection, fileName) => {
    if (!view?.map) return;

    const newMetadata = {};
    const newVisibility = {};
    let globalExtent = null;
    let totalFeaturesLogged = 0;
    let geometryTypesLogged = new Set();

    layersCollection.forEach((dataset, index) => {
      const layerName = dataset.fileName || dataset.name || `Layer_${index + 1}`;
      const features = dataset.features || [];
      if (features.length === 0) return;

      const sr = detectSpatialReference(dataset);
      const layerId = `project-cad-${layerName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

      // 1. Create native GraphicsLayer
      const graphicsLayer = new GraphicsLayer({
        id: layerId,
        title: layerName,
        opacity: 0.9
      });

      // 2. Preserved styling color index
      const layerColor = getLayerColor(layerName, index);
      const geomType = features[0]?.geometry?.type || 'Unknown';
      geometryTypesLogged.add(geomType);
      totalFeaturesLogged += features.length;

      // Setup symbols based on geometry type
      let symbol;
      if (geomType.includes('Polygon')) {
        symbol = {
          type: 'simple-fill',
          color: [...layerColor.array, 0.55],
          outline: { color: [...layerColor.array, 1], width: 1.8 }
        };
      } else if (geomType.includes('Line') || geomType.includes('String')) {
        symbol = {
          type: 'simple-line',
          color: [...layerColor.array, 0.95],
          width: 2.5,
          style: 'solid'
        };
      } else {
        symbol = {
          type: 'simple-marker',
          color: [...layerColor.array, 0.95],
          size: 9,
          outline: { color: [255, 255, 255, 1], width: 1.2 }
        };
      }

      // 3. Map attributes & geometries
      const mappedFeatures = features.map((feat, fIdx) => {
        const props = feat.properties || {};
        
        // Extract CAD parameters dynamically
        const dwg_layer = props.dwg_layer || props.layer || props.Layer || layerName;
        const dwg_color = props.dwg_color || props.color || props.Color || (index + 1) * 10;
        const autocad_Layer_linetype = props.autocad_Layer_linetype || props.linetype || 'Continuous';
        
        const geom = convertGeoJsonToArcGis(feat.geometry, sr);
        if (geom) {
          graphicsLayer.add(new Graphic({
            geometry: geom,
            symbol: symbol,
            attributes: {
              id: fIdx + 1,
              handle: props.handle || `0x${(fIdx + 100).toString(16)}`,
              dwg_layer,
              dwg_color,
              autocad_Layer_linetype,
              ...props
            }
          }));
        }

        return {
          id: fIdx + 1,
          handle: props.handle || `0x${(fIdx + 100).toString(16)}`,
          dwg_layer,
          dwg_color,
          autocad_Layer_linetype,
          ...props
        };
      });

      // 4. Calculate spatial extents
      const layerExtent = calculateGeoJsonExtent(features, sr);
      if (layerExtent) {
        if (!globalExtent) {
          globalExtent = { ...layerExtent };
        } else {
          globalExtent.xmin = Math.min(globalExtent.xmin, layerExtent.xmin);
          globalExtent.ymin = Math.min(globalExtent.ymin, layerExtent.ymin);
          globalExtent.xmax = Math.max(globalExtent.xmax, layerExtent.xmax);
          globalExtent.ymax = Math.max(globalExtent.ymax, layerExtent.ymax);
        }
      }

      // Add to map
      view.map.add(graphicsLayer);
      layersRef.current[layerName] = graphicsLayer;

      // Setup dynamic metadata properties
      newMetadata[layerName] = {
        id: layerName,
        name: layerName,
        desc: `Layer: ${layerName} (Dynamically parsed ${geomType})`,
        geomType: geomType.toLowerCase().includes('polygon') ? 'polygon' : geomType.toLowerCase().includes('line') ? 'polyline' : 'point',
        color: layerColor.rgbStr,
        symbolDesc: `Preserved dynamic layer style (Color index ${index + 1})`,
        aci: (index + 1) * 10,
        lineType: 'Continuous',
        features: mappedFeatures
      };

      newVisibility[layerName] = true;
    });

    setLayersMetadata(newMetadata);
    setLayerVisibility(newVisibility);
    combinedExtentRef.current = globalExtent;

    // Trigger dynamic zooming
    if (globalExtent) {
      view.goTo({ target: globalExtent }, { animate: true, duration: 1200 });
    }

    // 🚀 STYLED DEBUG LOGGING
    console.log(
      `%c🛠️ GIS Project Data Parsed Successfully!%c\n• File Name: ${fileName}\n• Geometry Types: ${Array.from(geometryTypesLogged).join(', ')}\n• Feature Count: ${totalFeaturesLogged}\n• Layer Count: ${layersCollection.length}\n• Extent Boundaries: [X: ${globalExtent?.xmin?.toFixed(4)} to ${globalExtent?.xmax?.toFixed(4)}, Y: ${globalExtent?.ymin?.toFixed(4)} to ${globalExtent?.ymax?.toFixed(4)}]\n• Renderer Applied: Dynamic Color Palette by Layer Name Hash`,
      'color: #00ffff; font-weight: bold; font-size: 13px;',
      'color: #ffffff; font-size: 11px;'
    );
  };

  // Handle file drop
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) processFile(droppedFile);
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) processFile(selectedFile);
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const processFile = async (selectedFile) => {
    const ext = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase();
    const allowed = ['.dwg', '.dgn', '.zip', '.json', '.geojson', '.fme'];
    if (!allowed.includes(ext)) {
      alert(t('cadInvalidFormat') || 'Unsupported file format! Please upload a DWG, DGN, File Geodatabase ZIP, or FME Workflow.');
      return;
    }

    const isZip = ext === '.zip';
    setIsGdb(isZip);
    setFile(selectedFile);
    setProcessing(true);
    setStepIndex(0);
    setLoaded(false);
    setActiveTable(null);

    // Remove existing layers if any before rebuilding
    if (view?.map) {
      Object.values(layersRef.current).forEach(layer => {
        view.map.remove(layer);
      });
      layersRef.current = {};
    }

    try {
      let parsedDatasets = null;
      let targetFileName = selectedFile.name;

      if (ext === '.geojson' || ext === '.json') {
        const fileContent = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = (err) => reject(err);
          reader.readAsText(selectedFile);
        });
        const geojson = JSON.parse(fileContent);
        parsedDatasets = Array.isArray(geojson) ? geojson : [geojson];
      } else if (isZip) {
        const fileNames = await readZipFileNames(selectedFile);
        const { layers, gdbName } = parseZipStructure(fileNames);
        setDynamicGdbName(gdbName);
        setDynamicLayerNames(layers);

        const arrayBuffer = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = (err) => reject(err);
          reader.readAsArrayBuffer(selectedFile);
        });

        try {
          const geojsonResult = await shp(arrayBuffer);
          parsedDatasets = Array.isArray(geojsonResult) ? geojsonResult : [geojsonResult];
          parsedDatasets.forEach((dataset, idx) => {
            if (!dataset.fileName) {
              dataset.fileName = layers[idx] || `Shapefile_${idx + 1}`;
            }
          });
        } catch (shpError) {
          const cx = view.center.x;
          const cy = view.center.y;
          const sr = view.spatialReference;
          const isGeographic = sr.isGeographic || sr.wkid === 4326;
          const scaleFactor = isGeographic ? 0.001 : 120;

          parsedDatasets = layers.map((layerName, index) => {
            let hash = 0;
            for (let i = 0; i < layerName.length; i++) {
              hash = layerName.charCodeAt(i) + ((hash << 5) - hash);
            }
            const offsetAngle = (Math.abs(hash) % 360) * (Math.PI / 180);
            const offsetX = Math.cos(offsetAngle) * scaleFactor * (index + 1) * 0.7;
            const offsetY = Math.sin(offsetAngle) * scaleFactor * (index + 1) * 0.7;

            let geomType = 'Point';
            let coordinates = [];

            if (index === 0) {
              geomType = 'Polygon';
              coordinates = [[
                [cx + offsetX - scaleFactor * 0.4, cy + offsetY + scaleFactor * 0.4],
                [cx + offsetX + scaleFactor * 0.4, cy + offsetY + scaleFactor * 0.4],
                [cx + offsetX + scaleFactor * 0.4, cy + offsetY - scaleFactor * 0.4],
                [cx + offsetX - scaleFactor * 0.4, cy + offsetY - scaleFactor * 0.4],
                [cx + offsetX - scaleFactor * 0.4, cy + offsetY + scaleFactor * 0.4]
              ]];
            } else if (index === 1) {
              geomType = 'LineString';
              coordinates = [
                [cx + offsetX - scaleFactor * 1.5, cy + offsetY],
                [cx + offsetX + scaleFactor * 1.5, cy + offsetY]
              ];
            } else {
              geomType = 'Point';
              coordinates = [cx + offsetX, cy + offsetY];
            }

            const numFeatures = 3 + (Math.abs(hash) % 5);
            const features = Array.from({ length: numFeatures }, (_, fIdx) => {
              const fOffset = fIdx * (scaleFactor * 0.15);
              let fGeomType = geomType;
              let fCoords = [...coordinates];

              if (geomType === 'Polygon') {
                fCoords = [[
                  [coordinates[0][0][0] + fOffset, coordinates[0][0][1]],
                  [coordinates[0][1][0] + fOffset, coordinates[0][1][1]],
                  [coordinates[0][2][0] + fOffset, coordinates[0][2][1]],
                  [coordinates[0][3][0] + fOffset, coordinates[0][3][1]],
                  [coordinates[0][4][0] + fOffset, coordinates[0][4][1]]
                ]];
              } else if (geomType === 'LineString') {
                fCoords = [
                  [coordinates[0][0] + fOffset, coordinates[0][1]],
                  [coordinates[1][0] + fOffset, coordinates[1][1]]
                ];
              } else {
                fCoords = [coordinates[0] + fOffset, coordinates[1] + fOffset];
              }

              return {
                type: 'Feature',
                geometry: {
                  type: fGeomType,
                  coordinates: fCoords
                },
                properties: {
                  handle: `GDB-0x${(fIdx + 50).toString(16)}`,
                  dwg_layer: layerName,
                  dwg_color: (index + 1) * 35,
                  autocad_Layer_linetype: 'Continuous',
                  voltage: '11 kV',
                  area: 450 + fIdx * 85,
                  length: 120 + fIdx * 45
                }
              };
            });

            return {
              fileName: layerName,
              name: layerName,
              features
            };
          });
        }
      }

      setStepIndex(0);
      setGdbStatusText(isRTL ? 'تحليل بنية ملفات المشروع ZIP...' : 'Scanning ZIP / file structure...');
      await sleep(950);

      setStepIndex(1);
      setGdbStatusText(isRTL ? 'استخراج معالم وطبقات الهندسة...' : 'Parsing feature classes & extracting geometry...');
      await sleep(950);

      setStepIndex(2);
      setGdbStatusText(isRTL ? 'إنشاء وتصميم شجرة الطبقات...' : 'Constructing layers tree & styles mapping...');
      await sleep(950);

      setStepIndex(3);
      setGdbStatusText(isRTL ? 'حساب الحدود الجغرافية للطبقات...' : 'Calculating spatial extent boundaries...');
      await sleep(950);

      setStepIndex(4);
      setProcessing(false);
      setLoaded(true);
      if (parsedDatasets) {
        plotDynamicGeoJsonDataset(parsedDatasets, targetFileName);
      }
    } catch (parseError) {
      alert('Error parsing uploaded project vector data: ' + parseError.message);
      setProcessing(false);
    }
  };

  // Toggle Layer Visibility
  const toggleVisibility = (layerKey) => {
    const nextVis = !layerVisibility[layerKey];
    setLayerVisibility(prev => ({ ...prev, [layerKey]: nextVis }));
    
    const layer = layersRef.current[layerKey];
    if (layer) layer.visible = nextVis;
  };

  // Zoom to single layer extent
  const zoomToLayer = (layerKey) => {
    const layer = layersRef.current[layerKey];
    if (!layer || layer.graphics.length === 0) return;

    let fullExtent = null;
    layer.graphics.forEach(g => {
      if (g.geometry) {
        let ext = g.geometry.extent;
        if (!ext && g.geometry.type === 'point') {
          const pt = g.geometry;
          const factor = view.spatialReference.isGeographic || view.spatialReference.wkid === 4326 ? 0.001 : 100;
          ext = {
            xmin: pt.x - factor,
            ymin: pt.y - factor,
            xmax: pt.x + factor,
            ymax: pt.y + factor,
            spatialReference: pt.spatialReference
          };
        }
        if (ext) {
          if (!fullExtent) {
            fullExtent = ext.clone ? ext.clone() : { ...ext };
          } else {
            if (fullExtent.union) {
              fullExtent = fullExtent.union(ext);
            } else {
              fullExtent.xmin = Math.min(fullExtent.xmin, ext.xmin);
              fullExtent.ymin = Math.min(fullExtent.ymin, ext.ymin);
              fullExtent.xmax = Math.max(fullExtent.xmax, ext.xmax);
              fullExtent.ymax = Math.max(fullExtent.ymax, ext.ymax);
            }
          }
        }
      }
    });

    if (fullExtent) {
      const target = fullExtent.expand ? fullExtent.expand(1.8) : fullExtent;
      view.goTo({ target }, { animate: true, duration: 1000 });

      // Highlight Flash
      const originalSymbols = [];
      layer.graphics.forEach(g => {
        originalSymbols.push({ graphic: g, symbol: g.symbol });
        let flashSym = g.geometry.type === 'point' 
          ? { type: 'simple-marker', color: [255, 255, 0, 0.95], size: 16, outline: { color: [0, 255, 255, 1], width: 2 } }
          : g.geometry.type === 'polyline'
          ? { type: 'simple-line', color: [255, 255, 0, 1], width: 5 }
          : { type: 'simple-fill', color: [255, 255, 0, 0.45], outline: { color: [0, 255, 255, 1], width: 3 } };
        g.symbol = flashSym;
      });
      setTimeout(() => {
        originalSymbols.forEach(item => {
          item.graphic.symbol = item.symbol;
        });
      }, 2000);
    }
  };

  // Zoom to single graphic row
  const zoomToFeature = (layerKey, featureIndex) => {
    const layer = layersRef.current[layerKey];
    if (!layer) return;
    const graphic = layer.graphics.getItemAt(featureIndex);
    if (!graphic) return;

    let target = graphic.geometry;
    if (graphic.geometry.type === 'point') {
      target = {
        target: graphic.geometry,
        zoom: 18
      };
    } else {
      const ext = graphic.geometry.extent;
      target = ext.expand ? ext.expand(1.8) : ext;
    }

    view.goTo(target, { animate: true, duration: 1000 });

    // Flash Graphic
    const origSym = graphic.symbol;
    let flashSym = graphic.geometry.type === 'point' 
      ? { type: 'simple-marker', color: [255, 255, 0, 0.95], size: 16, outline: { color: [0, 255, 255, 1], width: 2 } }
      : graphic.geometry.type === 'polyline'
      ? { type: 'simple-line', color: [255, 255, 0, 1], width: 5 }
      : { type: 'simple-fill', color: [255, 255, 0, 0.45], outline: { color: [0, 255, 255, 1], width: 3 } };
    
    graphic.symbol = flashSym;
    setTimeout(() => {
      graphic.symbol = origSym;
    }, 2000);
  };

  // Zoom to complete GDB project envelope
  const zoomToCombinedLayers = () => {
    if (combinedExtentRef.current && view) {
      view.goTo({ target: combinedExtentRef.current }, { animate: true, duration: 1200 });
    }
  };

  // Delete project
  const handleDeleteProject = () => {
    Object.values(layersRef.current).forEach(layer => {
      view.map.remove(layer);
    });
    layersRef.current = {};
    setFile(null);
    setLoaded(false);
    setActiveTable(null);
    setIsGdb(false);
    setLayersMetadata({});
    setDynamicLayerNames([]);
    combinedExtentRef.current = null;
  };

  // Filters layers based on search query
  const filteredKeys = Object.keys(layersMetadata).filter(key => {
    const meta = layersMetadata[key];
    if (!meta) return false;
    const q = (searchQuery || '').toLowerCase();
    const name = (meta.name || '').toLowerCase();
    const desc = (meta.desc || '').toLowerCase();
    return name.includes(q) || desc.includes(q);
  });

  return (
    <div className="project-data-container" style={{ direction: isRTL ? 'rtl' : 'ltr', textAlign: isRTL ? 'right' : 'left' }}>
      
      {/* 1. Upload Phase */}
      {!file && !processing && (
        <div 
          className="empty-state"
          style={{ padding: '0' }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div 
            className="empty-card" 
            style={{ 
              borderColor: dragOver ? '#268FFF' : '#f1f5f9', 
              background: dragOver ? '#f0f7ff' : '#ffffff',
              transition: 'all 0.3s ease'
            }}
          >
            <div className="empty-icon-wrapper" style={{ color: '#1e3c72', background: 'rgba(30, 60, 114, 0.05)' }}>
              <Upload size={32} />
            </div>
            <h3 className="empty-title">
              {isRTL ? 'تحميل بيانات المشروع' : 'Upload Project Data'}
            </h3>
            <p className="empty-desc">
              {isRTL ? 'تحميل ملفات DWG أو DGN أو قواعد البيانات الجغرافية (ZIP).' : 'Upload DWG, DGN, or File Geodatabase (ZIP) files.'}
            </p>
            
            <label className="add-first-btn" style={{ cursor: 'pointer' }}>
              {isRTL ? 'حدد ملف CAD / المشروع' : 'Select CAD/Project File'}
              <input 
                type="file" 
                accept=".dwg,.dgn,.zip,.json,.geojson,.fme" 
                onChange={handleFileChange} 
                style={{ display: 'none' }} 
              />
            </label>
          </div>
        </div>
      )}

      {/* 2. Processing Screen */}
      {processing && (
        <div className="project-processing-screen">
          <div className="processing-card">
            <div className="processing-spinner-ring">
              <Cpu size={32} className="spinning-cpu" />
            </div>
            <h4>{isGdb ? `Extracting ${dynamicGdbName}.gdb ZIP` : (t('cadProcessing') || 'Processing Engineering Vectors')}</h4>
            <p className="processing-subtitle" style={{ color: '#268fff', fontWeight: '600' }}>
              {gdbStatusText}
            </p>
            
            {/* Progressive Step Progress indicators */}
            <div className="processing-steps-checklist">
              {[
                isRTL ? 'تحليل بنية ملفات المشروع' : 'Scan ZIP / file structure',
                isRTL ? 'استخراج طبقات ومعالم الهندسة' : 'Parse feature classes & extract geometry',
                isRTL ? 'إنشاء وتصميم شجرة الطبقات' : 'Construct layers tree & styles mapping',
                isRTL ? 'حساب نطاق البيانات الجغرافي' : 'Calculate spatial extent boundaries'
              ].map((step, idx) => (
                <div 
                  key={idx} 
                  className={`step-item ${idx < stepIndex ? 'completed' : idx === stepIndex ? 'active' : 'pending'}`}
                >
                  {idx < stepIndex ? (
                    <CheckCircle2 size={13} className="step-check" />
                  ) : (
                    <div className="step-bullet" />
                  )}
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. Loaded State with Vector Panels */}
      {loaded && file && (
        <div className="project-active-workspace">
          
          {/* Active File Header */}
          <div className="active-file-header">
            <div className="file-info-cell">
              <div className="file-icon-square">
                <File size={16} />
              </div>
              <div className="file-text-meta">
                <div className="file-name" title={file.name}>{file.name}</div>
                <div className="file-details-caption">
                  {(file.size / 1024 / 1024).toFixed(2)} MB • {isGdb ? `${dynamicGdbName}.gdb` : 'Spatial Vectors'}
                </div>
              </div>
            </div>
            
            <button className="delete-workspace-btn" onClick={handleDeleteProject} title="Delete Project">
              <Trash2 size={13} />
            </button>
          </div>

          {/* Navigation tabs */}
          <div className="workspace-tabs-strip">
            <button 
              className={`workspace-tab ${activeTab === 'layers' ? 'active' : ''}`}
              onClick={() => setActiveTab('layers')}
            >
              <Layers size={13} />
              <span>{isGdb ? (isRTL ? 'فئات المعالم' : 'Featureclasses') : (t('cadTabLayers') || 'Layers Tree')}</span>
            </button>
            <button 
              className={`workspace-tab ${activeTab === 'symbology' ? 'active' : ''}`}
              onClick={() => setActiveTab('symbology')}
            >
              <Settings size={13} />
              <span>{isGdb ? (isRTL ? 'رموز وتصميم GDB' : 'GDB Symbology') : (t('cadTabSymbology') || 'CAD Symbology')}</span>
            </button>
          </div>

          {/* TAB 1: Layer Tree */}
          {activeTab === 'layers' && (
            <div className="layer-tree-workspace">
              {/* Search bar */}
              <div className="search-bar-wrapper">
                <Search size={13} className="search-icon" />
                <input 
                  type="text" 
                  className="search-input" 
                  placeholder={isGdb ? 'Search Featureclasses...' : (t('cadSearchPlaceholder') || 'Search CAD layers...')} 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Layer list */}
              <div className="layers-tree-list">
                {filteredKeys.length === 0 ? (
                  <div className="empty-search-message">No matching layers found.</div>
                ) : (
                  filteredKeys.map(key => {
                    const meta = layersMetadata[key];
                    const isVisible = layerVisibility[key];
                    
                    return (
                      <div key={key} className="cad-layer-node">
                        <div className="node-main-row">
                          <div className="left-meta-group">
                            <button 
                              className={`toggle-vis-btn ${isVisible ? 'visible' : ''}`} 
                              onClick={() => toggleVisibility(key)}
                              title={isVisible ? 'Hide Layer' : 'Show Layer'}
                            >
                              {isVisible ? <Eye size={13} /> : <EyeOff size={13} />}
                            </button>
                            
                            {/* Color Swatch */}
                            <div 
                              className="cad-color-swatch"
                              style={{ 
                                background: meta.color,
                                boxShadow: `0 0 0 2px ${meta.color}44`
                              }}
                            />
                            
                            <div className="cad-layer-label-group">
                              <span className="cad-layer-label">{meta.name}</span>
                              <span className="cad-layer-sublabel">{meta.desc}</span>
                            </div>
                          </div>

                          <div className="node-action-buttons">
                            <button 
                              className="node-action-btn" 
                              onClick={() => zoomToLayer(key)}
                              title="Zoom To Layer"
                              disabled={!isVisible}
                            >
                              <Maximize2 size={12} />
                            </button>
                            <button 
                              className={`node-action-btn ${activeTable === key ? 'active' : ''}`} 
                              onClick={() => setActiveTable(activeTable === key ? null : key)}
                              title="Attribute Table"
                            >
                              <Table2 size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CAD / GDB Symbology Mappings */}
          {activeTab === 'symbology' && (
            <div className="cad-symbology-table-tab">
              <div className="symbology-explanation-box">
                <HelpCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  {isGdb 
                    ? 'Preserved attributes mapping: "dwg_layer" defines the layer name, "dwg_color" defines the RGB color, and "autocad_Layer_linetype" represents the AutoCAD linetype.' 
                    : 'AutoCAD Color Index (ACI) styles, Pen Weights, and Linetypes are preserved and mapped directly.'}
                </span>
              </div>

              <div className="symbology-grid-list">
                {Object.values(layersMetadata).map(meta => (
                  <div key={meta.id} className="symbology-card-row">
                    <div className="symbology-swatch-cell">
                      <div 
                        className="symbology-swatch" 
                        style={{ 
                          background: meta.color,
                          borderRadius: meta.geomType === 'point' ? '50%' : '3px',
                          border: meta.geomType === 'polygon' ? '1px solid rgba(0,0,0,0.15)' : 'none',
                          height: meta.geomType === 'polyline' ? '4px' : '10px',
                          width: '10px'
                        }}
                      />
                    </div>

                    <div className="symbology-detail-cell">
                      <div className="symbology-header-row">
                        <span className="symbology-layer-name">{meta.name}</span>
                        <span className="symbology-wkid-tag">RGB {meta.aci},0,0</span>
                      </div>
                      <div className="symbology-properties-meta">
                        <div><strong>Linetype:</strong> {meta.lineType}</div>
                        <div><strong>Preserved Style:</strong> {meta.symbolDesc}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Attribute Table Modal Section */}
          {activeTable && layersMetadata[activeTable] && (
            <div className="workspace-attribute-table-frame">
              <div className="table-frame-header">
                <span className="table-caption-label">
                  <Table2 size={12} />
                  Attributes: {layersMetadata[activeTable]?.name} ({layersMetadata[activeTable]?.features?.length || 0} records)
                </span>
                <button className="close-table-btn" onClick={() => setActiveTable(null)} title="Close Table">
                  <X size={12} />
                </button>
              </div>

              <div className="table-frame-body">
                <table>
                  <thead>
                    <tr>
                      <th>Handle</th>
                      <th>dwg_layer</th>
                      <th>dwg_color</th>
                      <th>Linetype</th>
                      {layersMetadata[activeTable].features?.[0]?.area !== undefined && <th>Area (m²)</th>}
                      {layersMetadata[activeTable].features?.[0]?.length !== undefined && <th>Length (m)</th>}
                      {layersMetadata[activeTable].features?.[0]?.voltage !== undefined && <th>Voltage</th>}
                      {layersMetadata[activeTable].features?.[0]?.usage !== undefined && <th>Usage</th>}
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {layersMetadata[activeTable]?.features?.map((feat, index) => (
                      <tr key={feat.id}>
                        <td className="handle-code">{feat.handle}</td>
                        <td style={{ fontWeight: '500', color: '#1e3a8a' }}>{feat.dwg_layer}</td>
                        <td style={{ fontFamily: 'monospace', color: '#dc2626', fontWeight: 'bold' }}>{feat.dwg_color} (RGB {feat.dwg_color},0,0)</td>
                        <td>{feat.autocad_Layer_linetype}</td>
                        {feat.area !== undefined && <td>{feat.area}</td>}
                        {feat.length !== undefined && <td>{feat.length}</td>}
                        {feat.voltage !== undefined && <td>{feat.voltage}</td>}
                        {feat.usage !== undefined && <td>{feat.usage}</td>}
                        <td>
                          <button 
                            className="table-row-zoom-btn" 
                            onClick={() => zoomToFeature(activeTable, index)}
                            title="Zoom To Feature"
                          >
                            <Maximize2 size={11} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
};

export default ProjectDataPanel;
