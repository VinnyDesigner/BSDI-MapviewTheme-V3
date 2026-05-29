import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import ArcGISMap from './components/MapView'
import { motion, AnimatePresence } from 'framer-motion'
import BottomToolbar from './components/BottomToolbar'
import SidePanel from './components/SidePanel'
import Header from './components/Header'
import MapControls from './components/MapControls'
import MapInfoWidget from './components/MapInfoWidget'
import DualMapView from './components/DualMapView'
import DownloadRestrictedModal from './components/DownloadRestrictedModal'
import Analysis3DPanel from './components/Analysis3DPanel'
import { getPanelComponent } from './registry/panelRegistry'
import { layersConfig } from './layers'
import { ewaWddTree } from './ewa_wdd_config'
import { LanguageProvider, useLanguage } from './context/LanguageContext'
import { translations } from './i18n/translations'
import './App.css'

import {
  Layers, Search, Navigation, Ruler, Pencil,
  Box, Database, Globe, Printer, Bookmark, Info,
  Columns2, ChevronRight, ChevronLeft, ChevronDown, MousePointer2, Square, Hexagon, Maximize2,
  Download, Lock, Map, Play, Pause, RotateCcw, Cpu
} from 'lucide-react';

// Custom 4-dot drag handle (2×2 grid)
const DragHandle = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ pointerEvents: 'none' }}>
    <circle cx="3" cy="3" r="1.2" />
    <circle cx="7" cy="3" r="1.2" />
    <circle cx="3" cy="7" r="1.2" />
    <circle cx="7" cy="7" r="1.2" />
  </svg>
);

import RightToolbar from './components/RightToolbar'

// ─── Inner app — has access to LanguageContext ────────────────────────────────
function AppInner() {
  const { t, lang, toggleLanguage } = useLanguage();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const drawerTools = [
    { id: 'layers', icon: Layers, label: translations[lang].tools.layers ?? 'Layers' },
    { id: 'time_compare', icon: (props) => (
      <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
        <path d="M16 12h-4V8" opacity="0.3"/>
        <path d="M12 2a10 10 0 0 1 10 10M12 22A10 10 0 0 1 2 12" strokeDasharray="4 2"/>
      </svg>
    ), label: translations[lang].tools.time_compare ?? 'Timelapse' },
    { id: 'split', icon: Columns2, label: translations[lang].tools.split ?? 'Swipe' },
    { id: 'split_view', icon: (props) => <i {...props} className={`material-icons ${props.className || ''}`} style={{ fontSize: '20px' }}>splitscreen</i>, label: translations[lang].tools.split_view ?? 'Split View' },
    { id: 'blend', icon: (props) => (
      <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="8" cy="12" r="7" />
        <circle cx="16" cy="12" r="7" />
      </svg>
    ), label: translations[lang].tools.blend ?? 'Blend' },
    { id: 'arcade', icon: (props) => (
      <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H7" />
      </svg>
    ), label: translations[lang].tools.arcade ?? 'Arcade' },
    { id: 'spatial_analysis', icon: (props) => (
      <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
        <path d="M22 12A10 10 0 0 0 12 2v10z" />
      </svg>
    ), label: translations[lang].tools.spatial_analysis ?? 'Spatial Analysis' },
    { id: 'navigation', icon: Navigation, label: translations[lang].tools.navigation ?? 'Navigation' },
    { id: 'measure', icon: Ruler, label: translations[lang].tools.measure ?? 'Measure' },
    { id: 'draw', icon: Pencil, label: translations[lang].tools.draw ?? 'Draw' },
    { id: 'data_request', icon: Database, label: translations[lang].tools.data_request ?? 'Data Request' },
    { id: 'add_data', icon: Globe, label: translations[lang].tools.add_data ?? 'Add Data' },
    { id: 'print', icon: Printer, label: translations[lang].tools.print ?? 'Print' },
    { id: 'bookmark', icon: Bookmark, label: translations[lang].tools.bookmark ?? 'Bookmark' },
    { id: 'geoprocessing', icon: Cpu, label: 'Geoprocessing' }
  ];

  const handleMobileToolSelect = (toolId) => {
    handleToolSelect(toolId);
    setIsMobileMenuOpen(false);
  };

  const [activeTool, setActiveTool] = useState(null)
  const [pinnedTools, setPinnedTools] = useState([])
  const [mapView, setMapView] = useState(null)
  const [is3D, setIs3D] = useState(false)
  const [layerVisibility, setLayerVisibility] = useState(
    layersConfig.reduce((acc, layer) => ({ ...acc, [layer.id]: layer.visible }), {})
  )
  
  const [splitLayers, setSplitLayers] = useState({
    left: [layersConfig[0]?.id || ''],
    right: [layersConfig[1]?.id || layersConfig[0]?.id || '']
  })
  const [splitBasemaps, setSplitBasemaps] = useState({
    left: 'streets-navigation-vector',
    right: 'satellite'
  });
  const [splitModes, setSplitModes] = useState({
    left: '2D',
    right: '2D'
  });
  const [isSplitModePersistent, setIsSplitModePersistent] = useState(false);
  const [isSplitView, setIsSplitView] = useState(false);
  const [syncMode, setSyncMode] = useState('both'); // 'both' | 'zoom' | 'none'
  const [showSplitBasemap, setShowSplitBasemap] = useState({ left: false, right: false });
  const [blendSettings, setBlendSettings] = useState({
    baseLayerId: null, // Will be set to currentBasemap when tool opens
    overlayLayerId: null, // No overlay by default
    opacity: 0.5,
    blendMode: 'multiply'
  });
  const [arcadeSettings, setArcadeSettings] = useState({
    applyTo: '',
    layerId: '',
    expression: '',
    template: '',
    status: '',
    lastApplied: null,
    preview: 'Enter expression to see preview',
    debugInfo: null,
    showDebug: false
  });
  const [spatialSettings, setSpatialSettings] = useState({
    subTool: 'Buffer Analysis',
    layerId: 'heritage-sites',
    bufferDistance: 1000,
    bufferUnit: 'meters',
    proximityPoint: null,
    distanceResult: null,
    isWaitingForClick: false,
    status: '',
    lastRun: null
  });

  const [dynamicMapServerData, setDynamicMapServerData] = useState({});

  const [activeLayerMenu, setActiveLayerMenu] = useState(null); // { id: string, type: 'root'|'sub' }
  const [layerMenuTriggerRect, setLayerMenuTriggerRect] = useState(null);

  useEffect(() => {
    if (activeLayerMenu === null) {
      setLayerMenuTriggerRect(null);
    }
  }, [activeLayerMenu]);

  useEffect(() => {
    if (!activeLayerMenu) return;
    const handleDocumentClick = (e) => {
      if (!e.target.closest('.layer-action-menu') && !e.target.closest('.more-btn')) {
        setActiveLayerMenu(null);
      }
    };
    const handleScrollOrResize = () => {
      const activeBtn = document.querySelector('.more-btn.active');
      if (activeBtn) {
        setLayerMenuTriggerRect(activeBtn.getBoundingClientRect());
      } else {
        setActiveLayerMenu(null);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [activeLayerMenu]);

  const [labelConfigModal, setLabelConfigModal] = useState(null); // { layerId: string, subId?: number }

  // Fetch MapServer data for dynamic layers and FeatureServer sublayers
  useEffect(() => {
    const fetchMapServerData = async () => {
      const dynamicLayers = layersConfig.filter(l => 
        l.type === 'map-image' || 
        (l.url && (l.url.toLowerCase().includes('featureserver') || l.url.toLowerCase().includes('mapserver')))
      );
      const dataUpdates = {};

      const getProxyUrl = (url) => {
        if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
          if (url.includes("https://gis9.smartgeoapps.com")) {
            return url.replace("https://gis9.smartgeoapps.com", "/arcgis-proxy");
          }
          if (url.includes("https://gis12.smartgeoapps.com")) {
            return url.replace("https://gis12.smartgeoapps.com", "/arcgis-proxy-gis12");
          }
        }
        return url;
      };

      for (const layer of dynamicLayers) {
        try {
          // Fetch main metadata
          const metaResponse = await fetch(`${getProxyUrl(layer.url)}?f=pjson`);
          const metaData = await metaResponse.json();
          
          // Fetch legend data (gracefully fallback if FeatureServer does not have `/legend` endpoint)
          let legendData = null;
          try {
            const legendResponse = await fetch(`${getProxyUrl(layer.url)}/legend?f=pjson`);
            if (legendResponse.ok) {
              legendData = await legendResponse.json();
            }
          } catch (legendErr) {
            console.warn(`Legend fetch omitted or failed for ${layer.title}:`, legendErr.message);
          }

          dataUpdates[layer.id] = {
            metadata: metaData,
            legend: legendData
          };

          // Initialize sublayer visibility if not already set
          if (metaData.layers) {
            setLayerVisibility(prev => {
              const newVis = { ...prev };
              metaData.layers.forEach(sub => {
                const subKey = `${layer.id}_sub_${sub.id}`;
                if (newVis[subKey] === undefined) {
                  newVis[subKey] = false;
                }
              });
              return newVis;
            });
          }
        } catch (error) {
          console.error(`Error fetching metadata for ${layer.title}:`, error);
        }
      }

      setDynamicMapServerData(prev => ({ ...prev, ...dataUpdates }));
    };

    fetchMapServerData();
  }, []);

  const [layerSearch, setLayerSearch] = useState('');
  const [addDataResults, setAddDataResults] = useState([]);
  const [addDataExpandedItems, setAddDataExpandedItems] = useState({});
  const [layerOrder, setLayerOrder] = useState(() => layersConfig.map(l => l.id));
  const [dragOverId, setDragOverId] = useState(null);
  const [dragInsertPositionState, setDragInsertPositionState] = useState(null);
  const dragInsertPosition = React.useRef(null);
  const dragItem = React.useRef(null);
  const dragOverItem = React.useRef(null);

  const toggleLayer = (id) => {
    setLayerVisibility(prev => {
      const newState = { ...prev };
      const isChecked = !prev[id];
      newState[id] = isChecked;

      // Use metadata to find all possible sublayers for this service
      const mapData = dynamicMapServerData[id];
      if (mapData && mapData.metadata.layers) {
        mapData.metadata.layers.forEach(sub => {
          const subKey = `${id}_sub_${sub.id}`;
          newState[subKey] = isChecked;
        });
      }

      // Also handle any existing state keys that might not be in metadata yet
      Object.keys(prev).forEach(key => {
        if (key.startsWith(`${id}_sub_`)) {
          newState[key] = isChecked;
        }
      });
      
      return newState;
    });
  };

  const toggleSubLayer = (layerId, subId, visible) => {
    const view = mapView;
    setLayerVisibility(prev => {
      const updates = { [`${layerId}_sub_${subId}`]: visible };
      
      const layerData = dynamicMapServerData[layerId];
      if (layerData && layerData.metadata.layers) {
        const sub = layerData.metadata.layers.find(l => l.id === subId);
        if (sub && sub.subLayerIds) {
          const toggleChildren = (ids) => {
            ids.forEach(childId => {
              updates[`${layerId}_sub_${childId}`] = visible;
              const child = layerData.metadata.layers.find(l => l.id === childId);
              if (child && child.subLayerIds) toggleChildren(child.subLayerIds);
            });
          };
          toggleChildren(sub.subLayerIds);
        }
      }

      // Sync with ArcGIS View
      if (view) {
        const layer = view.map.findLayerById(layerId);
        if (layer) {
          Object.keys(updates).forEach(key => {
            const sId = parseInt(key.split('_sub_')[1]);
            const s = typeof layer.findSublayerById === 'function' 
              ? layer.findSublayerById(sId) 
              : (layer.sublayers ? layer.sublayers.find(x => x.id === sId) : null);
            if (s) s.visible = updates[key];
          });
        }
      }
      
      return { ...prev, ...updates };
    });
  };

  // Identify State
  const [identifySettings, setIdentifySettings] = useState({
    mode: 'point', // 'point', 'rectangle', 'polygon'
    selectedLayerId: null,
    results: null, // { total: number, grouped: { [layerName]: features[] } }
    isQuerying: false
  });
  const [expandedIdentifyLayers, setExpandedIdentifyLayers] = useState([]);
  const [selectedIdentifyFeature, setSelectedIdentifyFeature] = useState(null); // { layerName, index }
  
  // Data Request State
  const [dataRequests, setDataRequests] = useState([]);
  const [approvedLayerIds, setApprovedLayerIds] = useState([]);
  const [isRestrictedModalOpen, setIsRestrictedModalOpen] = useState(false);
  const [dataRequestStep, setDataRequestStep] = useState('intro'); // 'intro', 'drawing', 'selection', 'form', 'success'
  const [requestAOI, setRequestAOI] = useState(null);
  const [intersectingLayers, setIntersectingLayers] = useState([]);
  const [selectedLayersForRequest, setSelectedLayersForRequest] = useState([]);
  const [lastRequestRef, setLastRequestRef] = useState('');
  const [activeDrawingTool, setActiveDrawingTool] = useState(null);

  const [isCheckingIntersecting, setIsCheckingIntersecting] = useState(false);

  const handleRequestSubmit = (request) => {
    const ref = `REQ-${Math.floor(100000 + Math.random() * 900000)}`;
    const finalRequest = { ...request, reference: ref };
    setDataRequests(prev => [finalRequest, ...prev]);
    setLastRequestRef(ref);
    setDataRequestStep('success');
    console.log('AUDIT LOG: Data Request Submitted', finalRequest);
  };

  const handleDownloadClick = useCallback((e, layer) => {
    if (e && e.stopPropagation) e.stopPropagation();
    
    if (!layer.restricted || approvedLayerIds.includes(layer.id)) {
      console.log('AUDIT LOG: Downloading layer', layer.title);
      alert(`Downloading ${layer.title}...`);
    } else {
      setIsRestrictedModalOpen(true);
    }
  }, [approvedLayerIds]);

  const handleDataRequestAOIChange = useCallback((geometry, layers, isComplete, checkingState = false) => {
    setRequestAOI(geometry);
    if (layers) setIntersectingLayers(layers);
    setIsCheckingIntersecting(checkingState);
    if (isComplete) {
      if (layers) {
        setSelectedLayersForRequest(layers.map(l => l.id));
      }
      setDataRequestStep('form');
      setActiveDrawingTool(null);
    }
  }, []);

  const [layerStates, setLayerStates] = useState({}); // { id: { opacity: 1, labels: true, visible: true, renderer: true } }
  const [layerPanelMode, setLayerPanelMode] = useState("layers");
  const [activeLayerEdit, setActiveLayerEdit] = useState(null);
  const [initialEffectsBackup, setInitialEffectsBackup] = useState(null);

  const updateLayerState = (id, updates) => {
    setLayerStates(prev => ({
      ...prev,
      [id]: { ...(prev[id] || { opacity: 1, labels: true, visible: true, renderer: true }), ...updates }
    }));
  };

  const handleLayerAction = async (action, layerId, subId = null) => {
    const fullId = subId !== null ? `${layerId}_sub_${subId}` : layerId;
    const view = mapView;
    if (!view) return;

    let target;
    if (subId !== null) {
      target = view.map.findLayerById(fullId);
      if (!target) {
        const parent = view.map.findLayerById(layerId);
        if (parent) {
          if (typeof parent.findSublayerById === 'function') {
            target = parent.findSublayerById(Number(subId));
          } else if (parent.sublayers) {
            target = parent.sublayers.find(s => s.id === subId || s.id === parseInt(subId));
          }
        }
      }
    } else {
      target = view.map.findLayerById(layerId);
    }

    if (!target) return;

    switch (action) {
      case 'zoom': {
        let extent = target.fullExtent || (target.layer && target.layer.fullExtent);
        
        // Group Layer Zoom Requirement:
        // "Zoom to Full Extent should calculate the combined extent of child layers."
        if (subId !== null && target.subLayerIds && target.subLayerIds.length > 0) {
          const parent = view.map.findLayerById(layerId);
          if (parent) {
            let combinedExtent = null;
            const collectExtent = (sub) => {
              if (sub.fullExtent) {
                if (!combinedExtent) {
                  combinedExtent = sub.fullExtent.clone();
                } else {
                  combinedExtent = combinedExtent.union(sub.fullExtent);
                }
              }
              if (sub.subLayerIds && sub.subLayerIds.length > 0) {
                sub.subLayerIds.forEach(cid => {
                  const childSub = typeof parent.findSublayerById === 'function'
                    ? parent.findSublayerById(Number(cid))
                    : (parent.sublayers ? parent.sublayers.find(s => s.id === cid || s.id === parseInt(cid)) : null);
                  if (childSub) collectExtent(childSub);
                });
              }
            };
            collectExtent(target);
            if (combinedExtent) {
              extent = combinedExtent;
            }
          }
        }
        
        if (extent) view.goTo(extent);
        break;
      }
      case 'zoomVisible':
        const targetScale = target.maxScale || target.minScale;
        if (targetScale > 0) {
          view.goTo({ scale: targetScale });
        }
        break;
      case 'toggleLabels':
        const labelState = !((layerStates[fullId] || {}).labels !== false);
        updateLayerState(fullId, { labels: labelState });
        if ('labelsVisible' in target) {
          target.labelsVisible = labelState;
        }
        break;
      case 'toggleViz':
        const vizState = !((layerStates[fullId] || {}).renderer !== false);
        updateLayerState(fullId, { renderer: vizState });
        target.visible = vizState;
        break;
      case 'customizeLayer':
        setActiveLayerEdit({ layerId, subId, target });
        setLayerPanelMode('customize-layer');
        break;
      case 'effectsLayer': {
        setActiveLayerEdit({ layerId, subId, target });
        const currentEffects = layerStates[fullId] || {};
        setInitialEffectsBackup({ ...currentEffects });
        setLayerPanelMode('effects-layer');
        break;
      }
      case 'remove':
        if (subId === null) {
          view.map.remove(target);
          setLayerOrder(prev => prev.filter(id => id !== layerId));
          setLayerVisibility(prev => {
            const next = { ...prev };
            delete next[layerId];
            Object.keys(next).forEach(k => { if (k.startsWith(`${layerId}_sub_`)) delete next[k]; });
            return next;
          });
        }
        break;
      default:
        break;
    }
    setActiveLayerMenu(null);
  };

  const handleStartDataRequest = () => {
    setActiveTool('data_request');
    setDataRequestStep('drawing');
    setRequestAOI(null);
    setIntersectingLayers([]);
    setSelectedLayersForRequest([]);
  };

  // ── Drag & Drop Handlers ─────────────────────────────────────────────────
  const handleDragStart = (e, dragData) => {
    e.stopPropagation();
    if (typeof dragData === 'string') {
      dragItem.current = { type: 'root', id: dragData };
    } else {
      dragItem.current = dragData;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(dragItem.current));
  };

  const handleDragOver = (e, overData) => {
    e.preventDefault();
    e.stopPropagation(); // Crucial to prevent bubbling
    if (!dragItem.current) return;
    
    let overObj = overData;
    if (typeof overData === 'string') {
      overObj = { type: 'root', id: overData };
    }
    
    if (dragItem.current.type !== overObj.type) {
      e.dataTransfer.dropEffect = 'none';
      setDragOverId(null);
      return;
    }
    
    if (dragItem.current.type === 'sublayer') {
      if (dragItem.current.rootId !== overObj.rootId || dragItem.current.parentId !== overObj.parentId) {
        e.dataTransfer.dropEffect = 'none';
        setDragOverId(null);
        return;
      }
    }
    
    e.dataTransfer.dropEffect = 'move';
    dragOverItem.current = overObj;
    
    const dragOverStr = overObj.type === 'root' ? overObj.id : `${overObj.rootId}_sub_${overObj.id}`;
    setDragOverId(dragOverStr);

    // Calculate insertion position
    const rect = e.currentTarget.getBoundingClientRect();
    const isAfter = (e.clientY - rect.top) > (rect.height / 2);
    const pos = isAfter ? 'after' : 'before';
    dragInsertPosition.current = pos;
    setDragInsertPositionState(pos);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const from = dragItem.current;
    const to = dragOverItem.current;
    if (!from || !to || from.id === to.id) {
       handleDragEnd();
       return;
    }

    const pos = dragInsertPosition.current;

    if (from.type === 'root' && to.type === 'root') {
      setLayerOrder(prev => {
        const arr = [...prev];
        const fromIdx = arr.indexOf(from.id);
        const toIdx = arr.indexOf(to.id);
        if (fromIdx > -1 && toIdx > -1) {
          arr.splice(fromIdx, 1);
          const newToIdx = arr.indexOf(to.id);
          const insertIdx = pos === 'after' ? newToIdx + 1 : newToIdx;
          arr.splice(insertIdx, 0, from.id);

          if (mapView && mapView.map) {
             const layerToMove = mapView.map.findLayerById(from.id);
             if (layerToMove) {
               const toLayer = mapView.map.findLayerById(to.id);
               if (toLayer) {
                 const mapLayerIdx = mapView.map.layers.indexOf(toLayer);
                 const finalMapIdx = pos === 'after' ? mapLayerIdx + 1 : mapLayerIdx;
                 mapView.map.reorder(layerToMove, finalMapIdx);
               }
             }
          }
        }
        return arr;
      });
    } else if (from.type === 'sublayer' && to.type === 'sublayer') {
      setDynamicMapServerData(prev => {
        const newData = { ...prev };
        const rootData = newData[from.rootId];
        if (rootData && rootData.metadata && rootData.metadata.layers) {
          rootData.metadata.layers = [...rootData.metadata.layers];
          const parentLayer = rootData.metadata.layers.find(l => l.id === from.parentId);
          
          if (parentLayer && parentLayer.subLayerIds) {
            const arr = [...parentLayer.subLayerIds];
            const fromIdx = arr.indexOf(from.id);
            const toIdx = arr.indexOf(to.id);
            if (fromIdx > -1 && toIdx > -1) {
              arr.splice(fromIdx, 1);
              const newToIdx = arr.indexOf(to.id);
              const insertIdx = pos === 'after' ? newToIdx + 1 : newToIdx;
              arr.splice(insertIdx, 0, from.id);
              parentLayer.subLayerIds = arr;
              
              if (mapView && mapView.map) {
                const rootArcgisLayer = mapView.map.findLayerById(from.rootId);
                if (rootArcgisLayer && rootArcgisLayer.type === 'map-image') {
                  const parentSublayer = (from.parentId === -1 || from.parentId == null) ? rootArcgisLayer : rootArcgisLayer.findSublayerById(from.parentId);
                  if (parentSublayer && parentSublayer.sublayers) {
                     const sublayerItem = parentSublayer.sublayers.find(s => s.id === from.id);
                     const toItem = parentSublayer.sublayers.find(s => s.id === to.id);
                     if (sublayerItem && toItem) {
                        const baseIdx = parentSublayer.sublayers.indexOf(toItem);
                        const newColIdx = pos === 'after' ? baseIdx + 1 : baseIdx;
                        parentSublayer.sublayers.reorder(sublayerItem, newColIdx);
                     }
                  }
                }
              }
            }
          } else if (from.parentId === -1 || from.parentId == null) {
            const rootLayers = rootData.metadata.layers.filter(l => l.parentLayerId == null || l.parentLayerId === -1);
            const fromLayer = rootLayers.find(l => l.id === from.id);
            const toLayer = rootLayers.find(l => l.id === to.id);
            if (fromLayer && toLayer) {
              const fromArrayIdx = rootData.metadata.layers.indexOf(fromLayer);
              const toArrayIdx = rootData.metadata.layers.indexOf(toLayer);
              if (fromArrayIdx > -1 && toArrayIdx > -1) {
                rootData.metadata.layers.splice(fromArrayIdx, 1);
                const newToArrayIdx = rootData.metadata.layers.indexOf(toLayer);
                const insertIdx = pos === 'after' ? newToArrayIdx + 1 : newToArrayIdx;
                rootData.metadata.layers.splice(insertIdx, 0, fromLayer);
                
                if (mapView && mapView.map) {
                  const rootArcgisLayer = mapView.map.findLayerById(from.rootId);
                  if (rootArcgisLayer && rootArcgisLayer.type === 'map-image' && rootArcgisLayer.sublayers) {
                    const sublayerItem = rootArcgisLayer.sublayers.find(s => s.id === from.id);
                    const toItem = rootArcgisLayer.sublayers.find(s => s.id === to.id);
                    if (sublayerItem && toItem) {
                      const baseIdx = rootArcgisLayer.sublayers.indexOf(toItem);
                      const newColIdx = pos === 'after' ? baseIdx + 1 : baseIdx;
                      rootArcgisLayer.sublayers.reorder(sublayerItem, newColIdx);
                    }
                  }
                }
              }
            }
          }
        }
        return newData;
      });
    }

    handleDragEnd();
  };

  const handleDragEnd = () => {
    dragItem.current = null;
    dragOverItem.current = null;
    setDragOverId(null);
    dragInsertPosition.current = null;
    setDragInsertPositionState(null);
  };

  // ── Layer Tree State (specifically for EWA_WDD) ──────────────────────────
  const [treeExpanded, setTreeExpanded] = useState({}); // Collapsed by default
  const [treeVisibility, setTreeVisibility] = useState({}); // Stores individual feature type visibility
  
  // ── Layer Tree Synchronization Helpers ──────────────────────────────────
  const updateTreeVisibility = (updates) => {
    setTreeVisibility(prev => ({ ...prev, ...updates }));
  };

  const handleToggleRoot = (checked) => {
    toggleLayer('ewa-wdd'); // Sync with standard visibility
    const updates = {};
    ewaWddTree.categories.forEach(cat => {
      updates[cat.title] = checked;
      cat.features.forEach(f => updates[`${cat.title}_${f}`] = checked);
    });
    updateTreeVisibility(updates);
  };

  const handleToggleDataset = (checked) => {
    const updates = {};
    ewaWddTree.categories.forEach(cat => {
      updates[cat.title] = checked;
      cat.features.forEach(f => updates[`${cat.title}_${f}`] = checked);
    });
    updateTreeVisibility(updates);
  };

  const handleToggleCategory = (catTitle, checked) => {
    const cat = ewaWddTree.categories.find(c => c.title === catTitle);
    const updates = { [catTitle]: checked };
    if (cat) {
      cat.features.forEach(f => updates[`${catTitle}_${f}`] = checked);
    }
    updateTreeVisibility(updates);
  };

  const getCategoryState = (cat) => {
    if (cat.features.length === 0) return { checked: !!treeVisibility[cat.title], indeterminate: false };
    const checkedCount = cat.features.filter(f => treeVisibility[`${cat.title}_${f}`]).length;
    return {
      checked: checkedCount === cat.features.length,
      indeterminate: checkedCount > 0 && checkedCount < cat.features.length
    };
  };

  const getDatasetState = () => {
    const catStates = ewaWddTree.categories.map(cat => getCategoryState(cat));
    const allChecked = catStates.every(s => s.checked);
    const noneChecked = catStates.every(s => !s.checked && !s.indeterminate);
    return {
      checked: allChecked,
      indeterminate: !allChecked && !noneChecked
    };
  };

  // ── Conditional 3D Logic ──────────────────────────────────────────────────
  // Ensure 3D view is only available where supported.
  // Automatically switch to 2D if Swipe or Split View is enabled while in 3D.
  useEffect(() => {
    const isSwipeActive = isSplitModePersistent;
    const isSplitViewActive = isSplitView;
    const isIncompatible = isSwipeActive || isSplitViewActive;

    if (isIncompatible && is3D) {
      setIs3D(false);
    }
  }, [isSplitModePersistent, isSplitView, is3D]);

  const is3DDisabled = isSplitModePersistent || isSplitView;

  const [timelapseSettings, setTimelapseSettings] = useState({
    layerId: '',
    timeField: '',
    currentYear: 2024,
    fromYear: 2018,
    toYear: 2024,
    startYear: 2018,
    endYear: 2024,
    isPlaying: false,
    speed: 'Medium',
    loop: true,
    mode: 'range',
    playbackInterval: 'Yearly',
    lastApply: 0
  });
  const [timeCompareTab, setTimeCompareTab] = useState('slider'); // 'slider' | 'swipe'
  const [swipeMode, setSwipeMode] = useState('vertical'); // 'vertical' | 'horizontal'
  
  // High performance swipe label updates using refs
  const labelARef = useRef(null);
  const labelBRef = useRef(null);
  const swipeReqRef = useRef(null);
  
  const handleSwipePosition = useCallback((info) => {
    if (swipeReqRef.current) cancelAnimationFrame(swipeReqRef.current);
    swipeReqRef.current = requestAnimationFrame(() => {
      const pos = info.position;
      const isVisualVertical = swipeMode === 'horizontal';
      const clearance = isVisualVertical ? '20px' : '60px';
      
      if (labelARef.current) {
        if (isVisualVertical) {
          labelARef.current.style.top = '85px';
          labelARef.current.style.left = `${pos}%`;
          labelARef.current.style.transform = `translate3d(calc(-100% - ${clearance}), 0, 0)`;
        } else {
          labelARef.current.style.left = '50%';
          labelARef.current.style.top = `${pos}%`;
          labelARef.current.style.transform = `translate3d(-50%, calc(-100% - ${clearance}), 0)`;
        }
      }

      if (labelBRef.current) {
        if (isVisualVertical) {
          labelBRef.current.style.top = '85px';
          labelBRef.current.style.left = `${pos}%`;
          labelBRef.current.style.transform = `translate3d(${clearance}, 0, 0)`;
        } else {
          labelBRef.current.style.left = '50%';
          labelBRef.current.style.top = `${pos}%`;
          labelBRef.current.style.transform = `translate3d(-50%, ${clearance}, 0)`;
        }
      }
    });
  }, [swipeMode]);
  const [currentBasemap, setCurrentBasemap] = useState('streets');

  const basemaps = [
    {
      id: "dark-gray-vector",
      title: "Dark Gray Canvas",
      thumbnail: "/assets/basemaps/dark-gray.jpg"
    },
    {
      id: "satellite",
      title: "Imagery",
      thumbnail: "/assets/basemaps/imagery.jpg"
    },
    {
      id: "hybrid",
      title: "Imagery Hybrid",
      thumbnail: "/assets/basemaps/hybrid.jpg"
    },
    {
      id: "gray-vector",
      title: "Light Gray Canvas",
      thumbnail: "/assets/basemaps/light-gray.jpg"
    },
    {
      id: "streets-navigation-vector",
      title: "Navigation Map",
      thumbnail: "/assets/basemaps/navigation.jpg"
    },
    {
      id: "oceans",
      title: "Oceans",
      thumbnail: "/assets/basemaps/oceans.jpg"
    }
  ];

  // ── Tool icon lookup ────────────────────────────────────────────────────────
  const getToolIcon = (toolId) => {
    const icons = {
      layers: <Layers size={16} />, search: <Search size={16} />,
      navigation: <Navigation size={16} />, measure: <Ruler size={16} />,
      draw: <Pencil size={16} />, cad: <Box size={16} />,
      data_request: <Database size={16} />, add_data: <Globe size={16} />,
      print: <Printer size={16} />, bookmark: <Bookmark size={16} />,
      identify:     <Info size={16} />, 
      split:        <Columns2 size={16} />,
      split_view:   <i className="material-icons" style={{ fontSize: '16px' }}>splitscreen</i>,
      blend: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="8" cy="12" r="7" />
          <circle cx="16" cy="12" r="7" />
        </svg>
      ),
      time_compare: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
          <path d="M16 12h-4V8" opacity="0.3"/>
          <path d="M12 2a10 10 0 0 1 10 10M12 22A10 10 0 0 1 2 12" strokeDasharray="4 2"/>
        </svg>
      ),
      arcade: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H7" />
        </svg>
      ),
      spatial_analysis: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
          <path d="M22 12A10 10 0 0 0 12 2v10z" />
        </svg>
      )
    };
    return icons[toolId] ?? null;
  }

  // ── Panel title — reads from nested panelTitles map ──────────────────────
  const getPanelTitle = (toolId) => {
    if (!toolId) return '';
    return translations[lang].panelTitles[toolId]
      ?? (toolId.charAt(0).toUpperCase() + toolId.slice(1).replace('_', ' '));
  }



  const handleToolSelect = (toolId) => {
    if (toolId === activeTool) { 
      setActiveTool(null); 
      return; 
    }

    // Mutual Exclusivity: Disable persistent features when switching to a different tool
    if (toolId !== 'split_view') setIsSplitView(false);
    if (toolId !== 'split') setIsSplitModePersistent(false);
    
    // Disable blending if we move to a feature that doesn't support it (split/swipe)
    // But keep it active if we're just opening other panels like search? 
    // User said "Only one active tool at a time" and "Do not stack with split/swipe"
    // So if split or swipe becomes active, we must ensure blend is effectively "off".
    // We'll use the activeTool === 'blend' check to render it in MapView.

    if (toolId === 'data_request') {
      setIsRestrictedModalOpen(true);
      return;
    }

    if (toolId === 'blend') {
      setBlendSettings(prev => ({
        ...prev,
        baseLayerId: currentBasemap,
        overlayLayerId: null // Reset overlay when opening
      }));
    }

    if (toolId === 'time_compare') {
      // Ensure target layer is visible
      setLayerVisibility(prev => ({ ...prev, 'blocks-bahrain': true }));
      setTimelapseSettings(prev => ({
        ...prev,
        fromYear: 2018,
        toYear: 2024,
        isPlaying: false
      }));
    }

    if (pinnedTools.includes(toolId)) setPinnedTools(prev => prev.filter(id => id !== toolId));
    setActiveTool(toolId);
  }

  const handleMinimize = () => {
    if (activeTool && !pinnedTools.includes(activeTool)) {
      setPinnedTools(prev => [...prev, activeTool]);
      setActiveTool(null);
    }
  }

  const handleRestore = (toolId) => {
    setPinnedTools(prev => prev.filter(id => id !== toolId));
    setActiveTool(toolId);
  }


  // ── Panel content ──────────────────────────────────────────────────────────
  // ✅ All t() calls are for STATIC UI strings only.
  // ❌ Dynamic data (layer.title, API values) is rendered directly — never t(layer.title).
  const getPanelContent = (toolId) => {
    const PanelComponent = getPanelComponent(toolId);
    if (!PanelComponent) {
      return (
        <div className="tool-content">
          <p>{t('comingSoon')} <strong>{toolId}</strong> {t('comingSoonSuffix')}</p>
        </div>
      );
    }

    const allCollectedProps = {
      t,
      lang,
      view: mapView,
      mapView,
      is3D,
      setIs3D,
      basemaps,
      currentBasemap,
      setCurrentBasemap,
      layersConfig,
      layerPanelMode,
      setLayerPanelMode,
      activeLayerEdit,
      setActiveLayerEdit,
      layerStates,
      setLayerStates,
      updateLayerState,
      layerOrder,
      setLayerOrder,
      layerVisibility,
      setLayerVisibility,
      layerSearch,
      setLayerSearch,
      results: addDataResults,
      setResults: setAddDataResults,
      expandedItems: addDataExpandedItems,
      setExpandedItems: setAddDataExpandedItems,
      treeExpanded,
      setTreeExpanded,
      dragOverId,
      setDragOverId,
      dragInsertPositionState,
      setDragInsertPositionState,
      activeLayerMenu,
      setActiveLayerMenu,
      layerMenuTriggerRect,
      setLayerMenuTriggerRect,
      dynamicMapServerData,
      initialEffectsBackup,
      setInitialEffectsBackup,
      toggleLayer,
      toggleSubLayer,
      handleLayerAction,
      handleDragStart,
      handleDragOver,
      handleDrop,
      handleDragEnd,
      identifySettings,
      setIdentifySettings,
      expandedIdentifyLayers,
      setExpandedIdentifyLayers,
      selectedIdentifyFeature,
      setSelectedIdentifyFeature,
      blendSettings,
      setBlendSettings,
      spatialSettings,
      setSpatialSettings,
      splitLayers,
      setSplitLayers,
      splitBasemaps,
      setSplitBasemaps,
      isSplitModePersistent,
      setIsSplitModePersistent,
      swipeMode,
      setSwipeMode,
      showSplitBasemap,
      setShowSplitBasemap,
      isSplitView,
      setIsSplitView,
      splitModes,
      setSplitModes,
      syncMode,
      setSyncMode,
      settings: arcadeSettings,
      onSettingsChange: setArcadeSettings,
      step: dataRequestStep,
      setStep: setDataRequestStep,
      aoi: requestAOI,
      intersectingLayers,
      selectedLayers: selectedLayersForRequest,
      setSelectedLayers: setSelectedLayersForRequest,
      onDrawingToolSelect: setActiveDrawingTool,
      activeDrawingTool,
      lastRequestRef,
      onRequestSubmit: handleRequestSubmit,
      requestHistory: dataRequests,
      onReset: handleStartDataRequest,
      timeCompareTab,
      setTimeCompareTab,
      timelapseSettings,
      setTimelapseSettings,
      isCheckingIntersecting
    };

    return <PanelComponent {...allCollectedProps} />;
  }

  return (
    <div className="app-container" data-swipe-mode={swipeMode}>
      <Header onMenuClick={() => setIsMobileMenuOpen(true)} view={mapView} />
      <div style={{ display: isSplitView ? 'none' : 'block', width: '100%', height: '100%' }}>
        <ArcGISMap 
          layerVisibility={layerVisibility} 
          onViewReady={setMapView} 
          is3D={is3D} 
          isSplitMode={isSplitModePersistent}
          activeTool={activeTool}
          identifySettings={identifySettings}
          onIdentifyResults={(results) => setIdentifySettings(prev => ({ ...prev, results, isQuerying: false }))}
          onIdentifyQueryStart={() => setIdentifySettings(prev => ({ ...prev, isQuerying: true, results: null }))}
          blendSettings={activeTool === 'blend' ? blendSettings : null}
          arcadeSettings={activeTool === 'arcade' ? arcadeSettings : null}
          spatialSettings={activeTool === 'spatial_analysis' ? spatialSettings : null}
          timelapseSettings={activeTool === 'time_compare' ? timelapseSettings : null}
          isSplitView={activeTool === 'time_compare' && timeCompareTab === 'swipe'}
          onTimelapseYearChange={(year) => setTimelapseSettings(prev => ({ 
            ...prev, 
            toYear: prev.mode === 'range' ? year : prev.toYear,
            currentYear: prev.mode === 'single' ? year : prev.currentYear 
          }))}
          onSpatialResult={(data) => {
            if (typeof data === 'string' || data?.distance !== undefined && !data?.id) {
              const dist = typeof data === 'string' ? data : data.distance;
              setSpatialSettings(prev => ({ ...prev, distanceResult: dist, status: 'Nearest feature identified' }));
            } else if (data?.id) {
              setSpatialSettings(prev => ({ 
                ...prev, 
                history: [
                  ...(prev.history || []), 
                  { 
                    id: data.id, 
                    title: data.title, 
                    count: data.count, 
                    distance: data.distance, 
                    unit: data.unit,
                    date: new Date().toLocaleString(),
                    visible: true
                  }
                ],
                distanceResult: data.distanceResult !== undefined ? data.distanceResult : prev.distanceResult,
                status: 'Analysis complete' 
              }));
            }
          }}
          onArcadePreview={(val, debug) => setArcadeSettings(prev => ({ ...prev, preview: val, debugInfo: debug }))}
          splitLayers={splitLayers}
          splitBasemaps={splitBasemaps}
          basemap={currentBasemap}
          swipeMode={swipeMode}
          onSwipePositionChange={handleSwipePosition}
          onDataRequestAOIChange={handleDataRequestAOIChange}
          dataRequestDrawingTool={activeDrawingTool}
          dataRequestStep={dataRequestStep}
        />
      </div>
      
      <DualMapView 
        isSplitView={isSplitView} 
        splitLayers={splitLayers} 
        splitBasemaps={splitBasemaps}
        splitModes={splitModes}
        basemap={currentBasemap} 
        syncMode={syncMode}
        onExit={() => setIsSplitView(false)}
      />
      <div className="map-overlay-container">
        <Analysis3DPanel view={mapView} is3D={is3D} />
        <MapControls 
          view={mapView} 
          activeTool={activeTool} 
          onToolSelect={setActiveTool} 
          is3D={is3D} 
          onToggle3D={() => setIs3D(!is3D)} 
          is3DDisabled={is3DDisabled}
          isSplitView={isSplitView}
          isSwipeMode={isSplitModePersistent}
        />

        {mapView && <MapInfoWidget view={mapView} />}

        <SidePanel
          isOpen={!!activeTool}
          title={getPanelTitle(activeTool)}
          onClose={() => setActiveTool(null)}
          onMinimize={handleMinimize}
        >
          {getPanelContent(activeTool)}
        </SidePanel>

        {!activeTool && (
          <RightToolbar pinnedTools={pinnedTools} getToolIcon={getToolIcon} onRestore={handleRestore} />
        )}

        {!is3D && (
          <BottomToolbar 
            activeTool={activeTool} 
            onToolSelect={handleToolSelect} 
            swipeMode={swipeMode} 
            isSplitView={isSplitView}
            isSplitModePersistent={isSplitModePersistent}
          />
        )}

        {/* Swipe Labels — mode-aware positioning (Vertical Divider = L/R, Horizontal Divider = T/B) */}
        {(isSplitModePersistent || (activeTool === 'time_compare' && timeCompareTab === 'swipe')) && (() => {
          const isVisualVertical = swipeMode === 'horizontal';
          
          let labelAText = '';
          let labelBText = '';

          const isTemporalSwipe = activeTool === 'time_compare' && timeCompareTab === 'swipe';

          if (isTemporalSwipe) {
            const sideA = isVisualVertical ? 'Left' : 'Top';
            const sideB = isVisualVertical ? 'Right' : 'Bottom';
            labelAText = `${sideA}: ${timelapseSettings.fromYear}`;
            labelBText = `${sideB}: ${timelapseSettings.toYear}`;
          } else {
            const sideA = isVisualVertical ? 'Left' : 'Top';
            const sideB = isVisualVertical ? 'Right' : 'Bottom';
            
            const getLabelText = (layerIds, defaultText) => {
              if (!Array.isArray(layerIds) || layerIds.length === 0) return defaultText;
              if (layerIds.length === 1) {
                const id = layerIds[0];
                if (id.includes('_sub_')) return '1 sublayer';
                return layersConfig.find(l => l.id === id)?.title || '1 layer';
              }
              return `${layerIds.length} layers`;
            };

            labelAText = `${sideA}: ${getLabelText(splitLayers.left, 'Left Layer')}`;
            labelBText = `${sideB}: ${getLabelText(splitLayers.right, 'Right Layer')}`;
          }
          
          // Initial styles for server side render / mount
          const pos = 50;
          const clearance = isVisualVertical ? '20px' : '60px';
          const initLabelA = isVisualVertical
            ? { top: '85px', left: `${pos}%`, transform: `translate3d(calc(-100% - ${clearance}), 0, 0)` }
            : { left: '50%', top: `${pos}%`, transform: `translate3d(-50%, calc(-100% - ${clearance}), 0)` };
          const initLabelB = isVisualVertical
            ? { top: '85px', left: `${pos}%`, transform: `translate3d(${clearance}, 0, 0)` }
            : { left: '50%', top: `${pos}%`, transform: `translate3d(-50%, ${clearance}, 0)` };

          return (
            <div className="swipe-labels-container" style={{ position: 'fixed', top: '60px', bottom: 0, left: 0, right: 0, zIndex: 1000, pointerEvents: 'none' }}>
              <div className="swipe-label" ref={labelARef} style={initLabelA}>
                {labelAText}
              </div>
              <div className="swipe-label" ref={labelBRef} style={initLabelB}>
                {labelBText}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Mobile Tool Drawer / Bottom Sheet */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Backdrop Overlay */}
            <motion.div
              className="mobile-drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
            />

            {/* Side Drawer */}
            <motion.div
              className="mobile-drawer-container"
              initial={{ x: lang === 'AR' ? '-100%' : '100%' }}
              animate={{ x: 0 }}
              exit={{ x: lang === 'AR' ? '-100%' : '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            >
              {/* Drag Handle Indicator */}
              <div className="mobile-drawer-handle" />

              {/* Drawer Header */}
              <div className="mobile-drawer-header">
                <div className="mobile-user-profile">
                  <div className="mobile-avatar">
                    AK
                  </div>
                  <span className="mobile-username">User Name</span>
                </div>
                
                <div className="mobile-drawer-header-actions">
                  {/* Close button */}
                  <button 
                    className="mobile-drawer-close-btn"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <i className="material-icons">close</i>
                  </button>
                </div>
              </div>

              {/* Drawer Content */}
              <div className="mobile-drawer-content no-scrollbar">
                <div className="mobile-tools-grid">
                  {drawerTools.map(tool => {
                    const Icon = tool.icon;
                    const isActive = activeTool === tool.id || 
                                   (tool.id === 'split_view' && isSplitView) ||
                                   (tool.id === 'split' && isSplitModePersistent);
                    return (
                      <button
                        key={tool.id}
                        onClick={() => handleMobileToolSelect(tool.id)}
                        className={`mobile-tool-card ${isActive ? 'active' : ''}`}
                      >
                        <Icon className="mobile-tool-icon" />
                        <span className="mobile-tool-label">{tool.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <DownloadRestrictedModal 
        isOpen={isRestrictedModalOpen}
        onClose={() => setIsRestrictedModalOpen(false)}
        onRequestData={handleStartDataRequest}
      />
    </div>
  )
}

// ─── Root — wraps everything in LanguageProvider ──────────────────────────────
function App() {
  return (
    <LanguageProvider>
      <AppInner />
    </LanguageProvider>
  );
}

export default App
