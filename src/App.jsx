import React, { useState, useEffect, useCallback } from 'react'
import ArcGISMap from './components/MapView'
import { motion, AnimatePresence } from 'framer-motion'
import BottomToolbar from './components/BottomToolbar'
import SidePanel from './components/SidePanel'
import Header from './components/Header'
import MapControls from './components/MapControls'
import MapInfoWidget from './components/MapInfoWidget'
import DualMapView from './components/DualMapView'
import BookmarkPanel from './components/BookmarkPanel'
import PrintPanel from './components/PrintPanel'
import AddDataPanel from './components/AddDataPanel'
import DrawPanel from './components/DrawPanel'
import MeasurePanel from './components/MeasurePanel'
import DataRequestPanel from './components/DataRequestPanel'
import NavigationPanel from './components/NavigationPanel'
import CustomSelect from './components/CustomSelect'
import ArcadePanel from './components/ArcadePanel'
import DownloadRestrictedModal from './components/DownloadRestrictedModal'
import Analysis3DPanel from './components/Analysis3DPanel'
import TemporalFilterPanel from './components/TemporalFilterPanel'
import { layersConfig } from './layers'
import { ewaWddTree } from './ewa_wdd_config'
import { LanguageProvider, useLanguage } from './context/LanguageContext'
import { translations } from './i18n/translations'
import './App.css'

import {
  Layers, Search, Navigation, Ruler, Pencil,
  Box, Database, Globe, Printer, Bookmark, Info,
  Columns2, ChevronRight, ChevronLeft, ChevronDown, MousePointer2, Square, Hexagon, Maximize2,
  Download, Lock, Map, Play, Pause, RotateCcw
} from 'lucide-react';

// Custom 4-dot drag handle (2×2 grid)
const DragHandle = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
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
    { id: 'time_compare', icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
        <path d="M16 12h-4V8" opacity="0.3"/>
        <path d="M12 2a10 10 0 0 1 10 10M12 22A10 10 0 0 1 2 12" strokeDasharray="4 2"/>
      </svg>
    ), label: translations[lang].tools.time_compare ?? 'Temporal Filter' },
    { id: 'split', icon: Columns2, label: translations[lang].tools.split ?? 'Swipe' },
    { id: 'split_view', icon: () => <i className="material-icons" style={{ fontSize: '20px' }}>splitscreen</i>, label: translations[lang].tools.split_view ?? 'Split View' },
    { id: 'blend', icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="8" cy="12" r="7" />
        <circle cx="16" cy="12" r="7" />
      </svg>
    ), label: translations[lang].tools.blend ?? 'Blend' },
    { id: 'arcade', icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H7" />
      </svg>
    ), label: translations[lang].tools.arcade ?? 'Arcade' },
    { id: 'spatial_analysis', icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    { id: 'basemap', icon: Map, label: translations[lang].tools.basemap ?? 'Basemaps' }
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
  const [labelConfigModal, setLabelConfigModal] = useState(null); // { layerId: string, subId?: number }

  // Fetch MapServer data for dynamic layers
  useEffect(() => {
    const fetchMapServerData = async () => {
      const dynamicLayers = layersConfig.filter(l => l.type === 'map-image');
      const dataUpdates = {};

      const getProxyUrl = (url) => {
        if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
          return url.replace("https://gis9.smartgeoapps.com", "/arcgis-proxy");
        }
        return url;
      };

      for (const layer of dynamicLayers) {
        try {
          // Fetch main metadata
          const metaResponse = await fetch(`${getProxyUrl(layer.url)}?f=pjson`);
          const metaData = await metaResponse.json();
          
          // Fetch legend data
          const legendResponse = await fetch(`${getProxyUrl(layer.url)}/legend?f=pjson`);
          const legendData = await legendResponse.json();

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
                  newVis[subKey] = sub.defaultVisibility || false;
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
  const [layerOrder, setLayerOrder] = useState(() => layersConfig.map(l => l.id));
  const [dragOverId, setDragOverId] = useState(null);
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
        if (layer && layer.sublayers) {
          Object.keys(updates).forEach(key => {
            const sId = parseInt(key.split('_sub_')[1]);
            const s = layer.sublayers.find(x => x.id === sId);
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
    selectedLayerId: 'all',
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

  const handleDataRequestAOIChange = useCallback((geometry, layers, isComplete) => {
    setRequestAOI(geometry);
    setIntersectingLayers(layers);
    if (isComplete) {
      setDataRequestStep('selection');
      setActiveDrawingTool(null);
    }
  }, []);

  const [layerStates, setLayerStates] = useState({}); // { id: { opacity: 1, labels: true, visible: true, renderer: true } }
  const [layerPanelMode, setLayerPanelMode] = useState("layers");
  const [activeLayerEdit, setActiveLayerEdit] = useState(null);

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
      const parent = view.map.findLayerById(layerId);
      if (parent && parent.sublayers) {
        target = parent.sublayers.find(s => s.id === subId || s.id === parseInt(subId));
      }
    } else {
      target = view.map.findLayerById(layerId);
    }

    if (!target) return;

    switch (action) {
      case 'zoom':
        const extent = target.fullExtent || (target.layer && target.layer.fullExtent);
        if (extent) view.goTo(extent);
        break;
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
  const handleDragStart = (e, id) => {
    dragItem.current = id;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dragOverItem.current = id;
    setDragOverId(id);
  };

  const handleDrop = () => {
    const from = dragItem.current;
    const to = dragOverItem.current;
    if (!from || !to || from === to) return;
    setLayerOrder(prev => {
      const arr = [...prev];
      const fromIdx = arr.indexOf(from);
      const toIdx = arr.indexOf(to);
      arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, from);
      return arr;
    });
    dragItem.current = null;
    dragOverItem.current = null;
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    dragItem.current = null;
    dragOverItem.current = null;
    setDragOverId(null);
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
    layerId: 'sample-data-1',
    timeField: 'SURVEY_YEAR',
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
  const [swipeInfo, setSwipeInfo] = useState({ position: 50, viewWidth: 0, viewHeight: 0 });
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
      data_request: <Database size={16} />, external_data: <Globe size={16} />,
      print: <Printer size={16} />, bookmark: <Bookmark size={16} />,
      identify:     <Info size={16} />, 
      split:        <Columns2 size={16} />,
      split_view:   <i className="material-icons" style={{ fontSize: '16px' }}>splitscreen</i>,
      blend: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="8" cy="12" r="7" />
          <circle cx="16" cy="12" r="7" />
        </svg>
      ),
    };
    return icons[toolId] ?? null;
  }

  // ── Panel title — reads from nested panelTitles map ──────────────────────
  const getPanelTitle = (toolId) => {
    if (!toolId) return '';
    return translations[lang].panelTitles[toolId]
      ?? (toolId.charAt(0).toUpperCase() + toolId.slice(1).replace('_', ' '));
  }

  // ── Click-outside to close panel ───────────────────────────────────────────
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        activeTool &&
        activeTool !== 'split_view' && 
        activeTool !== 'identify' && 
        activeTool !== 'data_request' && 
        activeTool !== 'print' && 
        activeTool !== 'draw' && 
        activeTool !== 'measure' && 
        activeTool !== 'navigation' && 
        !e.target.closest('.side-panel-container') &&
        !e.target.closest('.bottom-toolbar-container') &&
        !e.target.closest('.map-controls-container') &&
        !e.target.closest('.right-toolbar-container')
      ) {
        setActiveTool(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeTool]);

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
    switch (toolId) {
      case 'basemap':
        return (
          <div className="tool-content">
            <div className="basemap-gallery">
              {basemaps.map((bm) => (
                <div 
                  key={bm.id} 
                  className={`basemap-item ${currentBasemap === bm.id ? 'active' : ''}`}
                  onClick={() => setCurrentBasemap(bm.id)}
                >
                  <div className="basemap-thumbnail">
                    <img 
                      src={bm.thumbnail} 
                      alt={bm.title} 
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = "/assets/fallback.jpg";
                      }}
                    />
                    {currentBasemap === bm.id && (
                      <div className="active-overlay">
                        <div className="check-mark">✓</div>
                      </div>
                    )}
                  </div>
                  <span className="basemap-title">{bm.title}</span>
                </div>
              ))}
            </div>
          </div>
        );
      case 'layers':
        if (layerPanelMode === 'customize-layer') {
          const target = activeLayerEdit?.target;
          const fullId = activeLayerEdit ? (activeLayerEdit.subId !== null ? `${activeLayerEdit.layerId}_sub_${activeLayerEdit.subId}` : activeLayerEdit.layerId) : null;
          const state = fullId ? (layerStates[fullId] || { opacity: 1, labels: true, visible: true, renderer: true }) : { opacity: 1, labels: true, visible: true, renderer: true };

          return (
            <div className="tool-content-full">
              <div className="tool-fixed-header" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button 
                  onClick={() => setLayerPanelMode('layers')}
                  style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', color: '#64748b', padding: 0, cursor: 'pointer' }}
                >
                  <ChevronLeft size={18} />
                </button>
                <h3 style={{ margin: 0, color: '#1a2f4d', fontSize: '14px', fontWeight: 'bold' }}>Customize Layer</h3>
              </div>
              <div className="tool-scroll-body" style={{ padding: '0 16px' }}>
                <form id="customizeForm" onSubmit={(e) => {
                  e.preventDefault();
                  if (!target) return;
                  const formData = new FormData(e.target);
                  
                  // Apply Symbology
                  const symbologyType = formData.get('symbologyType');
                  try {
                    if (symbologyType === 'simple') {
                      let symbol;
                      const geometryType = target.geometryType;
                      const color = formData.get('fillColor');
                      const outlineColor = formData.get('outlineColor');
                      const width = parseInt(formData.get('lineWidth')) || 1;
                      const transparency = parseInt(formData.get('transparency')) || 0;
                      const alpha = 1 - (transparency / 100);
                      
                      const hexToRgba = (hex, a) => {
                        const r = parseInt(hex.slice(1, 3), 16);
                        const g = parseInt(hex.slice(3, 5), 16);
                        const b = parseInt(hex.slice(5, 7), 16);
                        return `rgba(${r},${g},${b},${a})`;
                      };

                      if (geometryType === 'polygon' || geometryType === 'esriGeometryPolygon') {
                        symbol = {
                          type: "simple-fill",
                          color: hexToRgba(color, alpha),
                          style: formData.get('fillStyle') || 'solid',
                          outline: { color: outlineColor, width: width, style: formData.get('lineStyle') || 'solid' }
                        };
                      } else if (geometryType === 'polyline' || geometryType === 'esriGeometryPolyline') {
                        symbol = {
                          type: "simple-line",
                          color: hexToRgba(outlineColor, alpha),
                          width: width,
                          style: formData.get('lineStyle') || 'solid'
                        };
                      } else {
                        symbol = {
                          type: "simple-marker",
                          color: hexToRgba(color, alpha),
                          size: width * 4,
                          outline: { color: outlineColor, width: 1 }
                        };
                      }
                      target.renderer = { type: "simple", symbol: symbol };
                    } else if (symbologyType === 'attribute') {
                      const field = formData.get('attributeField');
                      target.renderer = {
                        type: "unique-value",
                        field: field,
                        defaultSymbol: {
                          type: "simple-fill",
                          color: "gray",
                          outline: { width: 0.5, color: "white" }
                        },
                        uniqueValueInfos: []
                      };
                    }
                  } catch (err) {
                    console.error('Error applying renderer:', err);
                  }

                  // Apply Opacity (Removed from form, kept untouched to avoid overwriting quick action)
                  
                  setLayerPanelMode('layers');
                }}>

                  {/* SYMBOLOGY SECTION */}
                  {/* SYMBOLOGY SECTION */}
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#64748b' }}>Symbology Type</label>
                    <select name="symbologyType" defaultValue="simple" className="tool-select" style={{ width: '100%', boxSizing: 'border-box' }} onChange={(e) => {
                      document.getElementById('simpleOptions').style.display = e.target.value === 'simple' ? 'block' : 'none';
                      document.getElementById('attributeOptions').style.display = e.target.value === 'attribute' ? 'block' : 'none';
                    }}>
                      <option value="simple">Simple</option>
                      <option value="attribute">Attribute</option>
                    </select>
                  </div>

                  <div id="simpleOptions" style={{ paddingBottom: '16px' }}>
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#64748b' }}>Color</label>
                        <input name="fillColor" type="color" defaultValue="#8b5cf6" className="tool-input" style={{ width: '100%', height: '36px', padding: '0', cursor: 'pointer', boxSizing: 'border-box' }} />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#64748b' }}>Outline Color</label>
                        <input name="outlineColor" type="color" defaultValue="#bef264" className="tool-input" style={{ width: '100%', height: '36px', padding: '0', cursor: 'pointer', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    
                    <div className="form-group" style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#64748b' }}>Line Width</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <input name="lineWidth" type="range" min="0" max="10" step="1" defaultValue={2} style={{ flex: 1, cursor: 'pointer' }} onChange={(e) => document.getElementById('lineWidthVal').value = e.target.value} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input id="lineWidthVal" type="number" defaultValue={2} min="0" max="10" className="tool-input" style={{ width: '68px', textAlign: 'center', padding: '0 8px' }} onChange={(e) => document.querySelector('input[name="lineWidth"]').value = e.target.value} />
                          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>px</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#64748b' }}>Line Style</label>
                        <select name="lineStyle" defaultValue="solid" className="tool-select" style={{ width: '100%', boxSizing: 'border-box' }}>
                          <option value="solid">Solid</option>
                          <option value="dash">Dash</option>
                          <option value="dot">Dot</option>
                          <option value="dash-dot">Dash Dot</option>
                          <option value="none">None</option>
                        </select>
                      </div>

                      <div className="form-group" style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#64748b' }}>Fill Style</label>
                        <select name="fillStyle" defaultValue="solid" className="tool-select" style={{ width: '100%', boxSizing: 'border-box' }}>
                          <option value="solid">Solid</option>
                          <option value="cross">Cross</option>
                          <option value="diagonal-cross">Diagonal Cross</option>
                          <option value="forward-diagonal">Forward Diagonal</option>
                          <option value="backward-diagonal">Backward Diagonal</option>
                          <option value="none">None</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div id="attributeOptions" style={{ display: 'none', paddingBottom: '16px' }}>
                    <div className="form-group" style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#64748b' }}>Pick an attribute to symbolize</label>
                      <select name="attributeField" className="tool-select" style={{ width: '100%', boxSizing: 'border-box' }}>
                        <option value="PROJECT_CODE">PROJECT_CODE</option>
                        <option value="STATUS">STATUS</option>
                        <option value="TYPE">TYPE</option>
                      </select>
                    </div>
                    
                    <div className="form-group" style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#64748b' }}>Transparency</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <input name="transparency" type="range" min="0" max="100" step="1" defaultValue={10} style={{ flex: 1, cursor: 'pointer' }} onChange={(e) => document.getElementById('transVal').value = e.target.value} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input id="transVal" type="number" defaultValue={10} min="0" max="100" className="tool-input" style={{ width: '68px', textAlign: 'center', padding: '0 8px' }} onChange={(e) => document.querySelector('input[name="transparency"]').value = e.target.value} />
                          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>%</span>
                        </div>
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#64748b' }}>Line Width</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <input name="attrLineWidth" type="range" min="0" max="10" step="1" defaultValue={2} style={{ flex: 1, cursor: 'pointer' }} onChange={(e) => document.getElementById('attrLineWidthVal').value = e.target.value} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input id="attrLineWidthVal" type="number" defaultValue={2} min="0" max="10" className="tool-input" style={{ width: '68px', textAlign: 'center', padding: '0 8px' }} onChange={(e) => document.querySelector('input[name="attrLineWidth"]').value = e.target.value} />
                          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>px</span>
                        </div>
                      </div>
                    </div>

                  </div>


                </form>
              </div>
              <div className="tool-fixed-footer" style={{ borderTop: '1px solid #e2e8f0', padding: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: 'transparent' }}>
                <button type="button" onClick={() => setLayerPanelMode('layers')} className="secondary-btn" style={{ padding: '8px 24px', background: 'transparent', border: '1px solid #cbd5e1' }}>Cancel</button>
                <button type="submit" form="customizeForm" className="primary-btn" style={{ padding: '8px 24px' }}>Apply</button>
              </div>
            </div>
          );
        }

        const orderedLayers = layerOrder.map(id => layersConfig.find(l => l.id === id)).filter(Boolean);
        const filteredLayers = orderedLayers.filter(l =>
          l.title.toLowerCase().includes(layerSearch.toLowerCase())
        );
        const allVisible = filteredLayers.length > 0 && filteredLayers.every(l => layerVisibility[l.id]);

        const renderActionMenu = (id, subId = null) => {
          const fullId = subId !== null ? `${id}_sub_${subId}` : id;
          const state = layerStates[fullId] || { opacity: 1, labels: true, visible: true, renderer: true };

          return (
            <motion.div 
              className="layer-action-menu"
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="menu-item" onClick={() => handleLayerAction('zoom', id, subId)}>
                <i className="material-icons">zoom_out_map</i> Zoom to Full Extent
              </div>
              <div className="menu-item" onClick={() => handleLayerAction('zoomVisible', id, subId)}>
                <i className="material-icons">straighten</i> Zoom to Visible Scale
              </div>
              <div className="menu-divider" />
              <div className="menu-section">
                <div className="section-label">
                  <i className="material-icons">opacity</i> Transparency
                </div>
                <div className="slider-container">
                  <input 
                    type="range" min="0" max="100" step="1" 
                    value={Math.round(state.opacity * 100)} 
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) / 100;
                      updateLayerState(fullId, { opacity: val });
                      const view = mapView;
                      if (view) {
                        let target;
                        if (subId !== null) {
                          const p = view.map.findLayerById(id);
                          if (p && p.sublayers) {
                            target = p.sublayers.find(s => s.id === subId || s.id === parseInt(subId, 10));
                          }
                        } else {
                          target = view.map.findLayerById(id);
                        }
                        if (target) target.opacity = val;
                      }
                    }}
                  />
                  <span>{Math.round(state.opacity * 100)}%</span>
                </div>
              </div>
              <div className="menu-divider" />
              <div className="menu-item-toggle">
                <span><i className="material-icons">visibility</i> Visibility</span>
                <input 
                  type="checkbox" className="switch-sm" 
                  checked={state.renderer !== false}
                  onChange={() => handleLayerAction('toggleViz', id, subId)}
                />
              </div>
              <div className="menu-item-toggle">
                <span><i className="material-icons">label</i> Labels</span>
                <input 
                  type="checkbox" className="switch-sm" 
                  checked={state.labels !== false}
                  onChange={() => handleLayerAction('toggleLabels', id, subId)}
                />
              </div>
              <div className="menu-item" onClick={() => handleLayerAction('customizeLayer', id, subId)}>
                <i className="material-icons">tune</i> Customize Layer
              </div>
              <div className="menu-divider" />
              <div className="menu-item delete" onClick={() => handleLayerAction('remove', id, subId)}>
                <i className="material-icons">delete</i> Remove Layer
              </div>
            </motion.div>
          );
        };

        return (
          <div className="tool-content" style={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="layer-search-container">
              <div className="search-container" style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input 
                  type="text" 
                  placeholder="Search layers..." 
                  className="layer-search-input"
                  value={layerSearch}
                  onChange={(e) => setLayerSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="layer-select-all-row">
              <label className="layer-card-label">
                <input 
                  type="checkbox" 
                  className="custom-checkbox"
                  checked={allVisible}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    const updates = {};
                    filteredLayers.forEach(l => updates[l.id] = checked);
                    setLayerVisibility(prev => ({ ...prev, ...updates }));
                  }}
                />
                <span className="layer-card-name">Select all</span>
              </label>
              <button 
                className="layer-clear-btn"
                onClick={() => {
                  const updates = {};
                  filteredLayers.forEach(l => updates[l.id] = false);
                  setLayerVisibility(prev => ({ ...prev, ...updates }));
                }}
              >
                Clear
              </button>
            </div>

            <div className="layer-list" style={{ flex: 1, overflowY: 'auto', padding: '4px' }} onClick={() => setActiveLayerMenu(null)} onScroll={() => setActiveLayerMenu(null)}>
              {filteredLayers.map(layer => {
                        const isMapServer = layer.type === 'map-image';
                        const isExpanded = treeExpanded[layer.id];
                        const mapData = dynamicMapServerData[layer.id];

                        const LegendSymbol = ({ type, color }) => {
                          if (type === 'point' || type === 'multipoint') return <div className="symbol-dot" style={{ backgroundColor: color }} />;
                          if (type === 'polyline') return <div className="symbol-line" style={{ backgroundColor: color }} />;
                          return <div className="symbol-square" style={{ borderColor: color, backgroundColor: `${color}22` }} />;
                        };

                        return (
                          <div 
                            key={layer.id}
                            className={`layer-tree-container ${dragOverId === layer.id ? 'drag-over' : ''}`}
                            draggable
                            onDragStart={(e) => handleDragStart(e, layer.id)}
                            onDragOver={(e) => handleDragOver(e, layer.id)}
                            onDrop={handleDrop}
                            onDragEnd={handleDragEnd}
                          >
                            <div className={`layer-card ${layerVisibility[layer.id] ? 'active' : ''} ${isExpanded ? 'tree-active' : ''}`} style={{ zIndex: activeLayerMenu === layer.id ? 9999 : undefined }}>
                              <div className="layer-card-main" style={{ zIndex: activeLayerMenu === layer.id ? 9999 : undefined }}>
                                <div className="layer-row-content">
                                  <span className="layer-drag-handle" onMouseDown={(e) => e.stopPropagation()}>
                                    <DragHandle />
                                  </span>
                                  
                                  <input 
                                    type="checkbox" 
                                    className="custom-checkbox"
                                    checked={layerVisibility[layer.id]}
                                    onChange={(e) => { e.stopPropagation(); toggleLayer(layer.id); }}
                                  />

                                  {isMapServer ? (
                                    <button 
                                      className={`layer-accordion-btn ${isExpanded ? 'expanded' : ''}`}
                                      onClick={(e) => { e.stopPropagation(); setTreeExpanded(prev => ({ ...prev, [layer.id]: !prev[layer.id] })); }}
                                    >
                                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </button>
                                  ) : <div style={{ width: 22 }} />}
                                  
                                  <span className="layer-card-name tree-label-root" title={layer.title}>{layer.title}</span>
                                </div>

                                <div className="layer-card-more" style={{ zIndex: activeLayerMenu === layer.id ? 9999 : undefined }}>
                                  <button 
                                    className={`more-btn ${activeLayerMenu === layer.id ? 'active' : ''}`}
                                    onClick={(e) => { 
                                      e.stopPropagation(); 
                                      setActiveLayerMenu(activeLayerMenu === layer.id ? null : layer.id); 
                                    }}
                                  >
                                    <i className="material-icons">more_horiz</i>
                                  </button>
                                  {activeLayerMenu === layer.id && renderActionMenu(layer.id)}
                                </div>
                              </div>
                            </div>

                            {isMapServer && isExpanded && mapData && (
                              <div className="tree-children">
                                {mapData.metadata.layers.map(sub => {
                                  if (sub.parentLayerId !== -1) return null;

                                  const renderSub = (s, depth = 1) => {
                                    const subId = `${layer.id}_sub_${s.id}`;
                                    const subExpanded = treeExpanded[subId];
                                    const hasChildren = s.subLayerIds && s.subLayerIds.length > 0;
                                    const isVisible = layerVisibility[subId];

                                    return (
                                      <React.Fragment key={s.id}>
                                        <div className={`tree-row ${depth > 1 ? 'nested' : ''}`} style={{ zIndex: activeLayerMenu === subId ? 9999 : undefined }}>
                                          <div className="layer-row-content">
                                            {/* Vertical/Horizontal connectors on the left */}
                                            {[...Array(depth)].map((_, i) => (
                                              <div key={i} className="tree-line-spacer">
                                                <div className="tree-line-v" />
                                                {i === depth - 1 && <div className="tree-line-h" />}
                                              </div>
                                            ))}

                                            {/* Parent checkbox */}
                                            <input 
                                              type="checkbox" 
                                              className="custom-checkbox"
                                              checked={isVisible}
                                              onChange={() => toggleSubLayer(layer.id, s.id, !isVisible)}
                                            />

                                            {/* Accordion toggle (for groups) */}
                                            {hasChildren ? (
                                              <button 
                                                className={`layer-accordion-btn ${subExpanded ? 'expanded' : ''}`}
                                                onClick={() => setTreeExpanded(prev => ({ ...prev, [subId]: !subExpanded }))}
                                              >
                                                {subExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                              </button>
                                            ) : (
                                              /* Legend symbol (only for leaf layers) */
                                              <div className="tree-symbol-wrapper">
                                                <LegendSymbol 
                                                  type={s.geometryType === 'esriGeometryPoint' ? 'point' : s.geometryType === 'esriGeometryPolyline' ? 'polyline' : 'polygon'} 
                                                  color={s.id % 2 === 0 ? '#3b82f6' : '#1e3c72'} 
                                                />
                                              </div>
                                            )}

                                            {/* Layer Name */}
                                            <span className={`tree-label ${hasChildren ? 'tree-label-category' : 'tree-label-leaf'}`}>
                                              {s.name}
                                            </span>
                                          </div>

                                          <div className="layer-card-more" style={{ zIndex: activeLayerMenu === subId ? 9999 : undefined }}>
                                            <button 
                                              className={`more-btn ${activeLayerMenu === subId ? 'active' : ''}`}
                                              onClick={(e) => { 
                                                e.stopPropagation(); 
                                                setActiveLayerMenu(activeLayerMenu === subId ? null : subId); 
                                              }}
                                            >
                                              <i className="material-icons">more_horiz</i>
                                            </button>
                                            {activeLayerMenu === subId && renderActionMenu(layer.id, s.id)}
                                          </div>
                                        </div>
                                        {hasChildren && subExpanded && s.subLayerIds.map(cid => {
                                          const child = mapData.metadata.layers.find(l => l.id === cid);
                                          return child ? renderSub(child, depth + 1) : null;
                                        })}
                                      </React.Fragment>
                                    );
                                  };
                                  return renderSub(sub);
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
            {filteredLayers.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: '13px' }}>
                No layers found matching "{layerSearch}"
              </div>
            )}
          </div>
        );

      case 'identify':
        const visibleIdentifyLayers = [];
        layersConfig.forEach(l => {
          if (l.type === 'feature' && layerVisibility[l.id]) {
            visibleIdentifyLayers.push({ id: l.id, title: l.title });
          } else if (l.type === 'map-image' && dynamicMapServerData[l.id]) {
            const mapData = dynamicMapServerData[l.id];
            if (mapData.metadata.layers) {
              mapData.metadata.layers.forEach(sub => {
                const subKey = `${l.id}_sub_${sub.id}`;
                if (layerVisibility[subKey]) {
                  visibleIdentifyLayers.push({ id: subKey, title: sub.name || sub.title });
                }
              });
            }
          }
        });

        return (
          <div className="tool-content">
            {!identifySettings.results ? (
              <>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>
                    Select Layer
                  </label>
                  <select 
                    className="tool-select"
                    value={identifySettings.selectedLayerId}
                    onChange={(e) => setIdentifySettings(prev => ({ ...prev, selectedLayerId: e.target.value }))}
                  >
                    <option value="all">All Visible Layers</option>
                    {visibleIdentifyLayers.map(l => (
                      <option key={l.id} value={l.id}>{l.title}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '12px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>
                    Identify Mode
                  </label>
                  <div className="identify-modes-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    {[
                      { id: 'point', label: 'Point', icon: <MousePointer2 size={18} /> },
                      { id: 'rectangle', label: 'Rectangle', icon: <Square size={18} /> },
                      { id: 'polygon', label: 'Polygon', icon: <Hexagon size={18} /> }
                    ].map(m => (
                      <button 
                        key={m.id}
                        className={`identify-mode-card ${identifySettings.mode === m.id ? 'active' : ''}`}
                        onClick={() => setIdentifySettings(prev => ({ ...prev, mode: m.id }))}
                      >
                        <div className="mode-icon">{m.icon}</div>
                        <span className="mode-label">{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="identify-instruction" style={{ textAlign: 'center', padding: '16px', color: '#64748b', fontSize: '13px', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1' }}>
                  <div style={{ marginBottom: '4px', fontWeight: '600', color: '#1e3c72' }}>
                    {identifySettings.mode === 'point' ? 'Map Click Active' : 'Drawing Active'}
                  </div>
                  {identifySettings.mode === 'point' 
                    ? 'Click on the map to identify features' 
                    : `Draw a ${identifySettings.mode} on the map`}
                </div>

                {identifySettings.isQuerying && (
                  <div style={{ textAlign: 'center', padding: '20px', color: '#df261c', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <div className="spinner-small" style={{ width: '16px', height: '16px', border: '2px solid #df261c', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                    Querying layers...
                  </div>
                )}
              </>
            ) : (
              <div className="identify-results-panel" style={{ 
                position: 'absolute', top: 16, left: 16, right: 16, bottom: 16, 
                display: 'flex', flexDirection: 'column', overflow: 'hidden' 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9', marginBottom: '4px', flexShrink: 0 }}>
                  <button 
                    onClick={() => {
                      setIdentifySettings(prev => ({ ...prev, results: null }));
                      setExpandedIdentifyLayers([]);
                      setSelectedIdentifyFeature(null);
                    }}
                    style={{ background: 'none', border: 'none', color: '#64748b', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#1e3c72' }}>Results ({identifySettings.results.total})</h3>
                </div>
                
                <div className="results-accordion no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '16px 4px 16px 0', minHeight: 0 }}>
                  {identifySettings.results.total === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                      No features found
                    </div>
                  ) : (
                    Object.entries(identifySettings.results.grouped).map(([layerName, features]) => {
                      const isExpanded = expandedIdentifyLayers.includes(layerName);
                      return (
                        <div key={layerName} className="layer-result-group" style={{ 
                          marginBottom: '10px', 
                          border: '1px solid #e2e8f0', 
                          borderRadius: '8px',
                          overflow: 'hidden',
                          background: isExpanded ? '#f8fafc' : '#ffffff',
                          boxShadow: isExpanded ? '0 4px 12px rgba(0,0,0,0.03)' : 'none',
                          transition: 'all 0.3s ease'
                        }}>
                          <button 
                            onClick={() => setExpandedIdentifyLayers(prev => 
                              isExpanded ? prev.filter(l => l !== layerName) : [...prev, layerName]
                            )}
                            style={{ 
                              width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                              padding: '12px 14px', background: isExpanded ? '#f1f5f9' : 'transparent', 
                              fontWeight: 'bold', fontSize: '12px', 
                              color: '#1e3c72', border: 'none', cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              outline: 'none',
                              borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              <span>{layerName}</span>
                            </div>
                            <span style={{ 
                              background: isExpanded ? '#cbd5e1' : '#f1f5f9', 
                              padding: '2px 8px', borderRadius: '10px', fontSize: '10px',
                              color: '#1e3c72'
                            }}>
                              {features.length}
                            </span>
                          </button>

                          {isExpanded && (
                            <div className="feature-list no-scrollbar" style={{ 
                              padding: '12px', 
                              maxHeight: '400px', overflowY: 'auto'
                            }}>
                              {features.map((f, i) => (
                                <div key={i} className="identify-result-card" style={{ 
                                  background: 'white', border: '1px solid #edf2f7', 
                                  borderRadius: '8px', marginBottom: '12px', padding: '12px', 
                                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                                  transition: 'all 0.2s ease'
                                }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #f7fafc', paddingBottom: '8px' }}>
                                    <span style={{ fontWeight: 'bold', color: '#1e3c72', fontSize: '13px' }}>
                                      {f.attributes[f.displayField] || 'Feature ' + (i + 1)}
                                    </span>
                                    <button 
                                      className="action-icon-btn" 
                                      title="Zoom To"
                                      onClick={() => mapView.goTo({ target: f.geometry, zoom: 15 })}
                                      style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', color: '#1e3c72', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '600' }}
                                    >
                                      <Maximize2 size={12} /> Zoom
                                    </button>
                                  </div>
                                  <div className="attributes-grid" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {Object.entries(f.attributes).map(([key, val]) => (
                                      <div key={key} style={{ display: 'flex', fontSize: '11px', borderBottom: '1px solid #f7fafc', padding: '2px 0' }}>
                                        <span style={{ color: '#94a3b8', width: '45%', flexShrink: 0 }}>{key}</span>
                                        <span style={{ color: '#1a2f4d', fontWeight: '500', wordBreak: 'break-all' }}>{String(val)}</span>
                                      </div>
                                    ))}
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

                <div style={{ 
                  display: 'flex', justifyContent: 'flex-end', 
                  padding: '12px 0 0 0', 
                  borderTop: '1px solid #f1f5f9',
                  marginTop: 'auto',
                  background: 'transparent',
                  flexShrink: 0,
                  zIndex: 100
                }}>
                  <button 
                    className="secondary-btn"
                    style={{ fontSize: '12px', padding: '8px 16px', fontWeight: '700', color: '#1e3c72', background: 'transparent', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s ease' }}
                    onClick={() => {
                      setIdentifySettings(prev => ({ ...prev, results: null }));
                      setExpandedIdentifyLayers([]);
                      setSelectedIdentifyFeature(null);
                    }}
                  >
                    Clear Results
                  </button>
                </div>
              </div>
            )}
          </div>
        );

      case 'blend':
        const basemapOptions = basemaps.map(bm => ({ id: bm.id, title: bm.title }));
        const isOverlaySelected = !!blendSettings.overlayLayerId;

        return (
          <div className="tool-content">
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>
                Base Layer (Background)
              </label>
              <CustomSelect 
                options={basemapOptions}
                value={blendSettings.baseLayerId}
                onChange={(val) => {
                  setBlendSettings(prev => ({ ...prev, baseLayerId: val }));
                  setCurrentBasemap(val); 
                }}
                placeholder="Select background imagery..."
              />
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>
                Overlay Layer (Imagery)
              </label>
              <CustomSelect 
                options={basemapOptions.filter(bm => bm.id !== blendSettings.baseLayerId)}
                value={blendSettings.overlayLayerId}
                onChange={(val) => setBlendSettings(prev => ({ ...prev, overlayLayerId: val }))}
                placeholder="Select overlay imagery..."
              />
            </div>

            <div className="form-group" style={{ marginBottom: '12px', opacity: isOverlaySelected ? 1 : 0.5, pointerEvents: isOverlaySelected ? 'auto' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{ fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Opacity</label>
                <span style={{ fontWeight: '700', color: '#DF261C', fontSize: '13px' }}>{Math.round(blendSettings.opacity * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01"
                value={blendSettings.opacity}
                disabled={!isOverlaySelected}
                onChange={(e) => setBlendSettings(prev => ({ ...prev, opacity: parseFloat(e.target.value) }))}
                style={{ 
                  width: '100%', 
                  accentColor: '#DF261C',
                  cursor: isOverlaySelected ? 'pointer' : 'default'
                }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '12px', opacity: isOverlaySelected ? 1 : 0.5, pointerEvents: isOverlaySelected ? 'auto' : 'none' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>
                Blend Mode
              </label>
              <CustomSelect 
                options={[
                  { id: 'normal', title: 'normal' },
                  { id: 'multiply', title: 'multiply' },
                  { id: 'screen', title: 'screen' },
                  { id: 'overlay', title: 'overlay' },
                  { id: 'darken', title: 'darken' },
                  { id: 'lighten', title: 'lighten' },
                  { id: 'soft-light', title: 'soft-light' },
                  { id: 'hard-light', title: 'hard-light' },
                  { id: 'color-burn', title: 'color-burn' },
                  { id: 'color-dodge', title: 'color-dodge' }
                ]}
                value={blendSettings.blendMode}
                disabled={!isOverlaySelected}
                onChange={(val) => setBlendSettings(prev => ({ ...prev, blendMode: val }))}
                placeholder="Select blend mode..."
              />
            </div>
          </div>
        );

      case 'arcade':
        return (
          <ArcadePanel 
            view={mapView}
            layersConfig={layersConfig}
            settings={arcadeSettings}
            onSettingsChange={setArcadeSettings}
          />
        );

      case 'spatial_analysis':
        return (
          <div className="tool-content-full">
            <div className="tool-scroll-body">
              <div className="form-group">
                <label>Select Analysis Tool</label>
                <CustomSelect 
                  options={[
                    "Buffer Analysis",
                    "Select by Location",
                    "Overlay (Intersect)",
                    "Proximity (Nearest)",
                    "Heatmap Density"
                  ]}
                  value={spatialSettings.subTool}
                  onChange={(val) => setSpatialSettings({...spatialSettings, subTool: val})}
                />
              </div>

              <div className="form-group">
                <label>Target Layer</label>
                <CustomSelect 
                  options={layersConfig}
                  value={spatialSettings.layerId}
                  onChange={(val) => setSpatialSettings({...spatialSettings, layerId: val})}
                  placeholder="Select Layer..."
                />
              </div>

              {spatialSettings.subTool === 'Buffer Analysis' && (
                <div className="form-group">
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ flex: 2 }}>
                      <label>Distance</label>
                      <input 
                        type="number" 
                        className="tool-input" 
                        value={spatialSettings.bufferDistance}
                        onChange={(e) => setSpatialSettings({...spatialSettings, bufferDistance: Number(e.target.value)})}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>Unit</label>
                      <CustomSelect 
                        options={[
                          { label: 'm', value: 'meters' },
                          { label: 'km', value: 'kilometers' },
                          { label: 'mi', value: 'miles' }
                        ]}
                        value={spatialSettings.bufferUnit}
                        onChange={(val) => setSpatialSettings({...spatialSettings, bufferUnit: val})}
                      />
                    </div>
                  </div>
                </div>
              )}

              {spatialSettings.subTool === 'Proximity (Nearest)' && (
                <div className="instruction-box">
                  <span className="box-title">Instructions:</span>
                  <p>Click any point on the map to find the nearest feature in the selected layer.</p>
                </div>
              )}

              <div className="form-group">
                <div className="info-box">
                  <h4 className="info-title">Tool Info:</h4>
                  <p className="info-text">
                    {spatialSettings.subTool === 'Buffer Analysis' && "Creates a polygon around map features at a specified distance."}
                    {spatialSettings.subTool === 'Select by Location' && "Filters features based on their spatial relationship with another layer."}
                    {spatialSettings.subTool === 'Overlay (Intersect)' && "Identifies areas where two layers geographically overlap."}
                    {spatialSettings.subTool === 'Proximity (Nearest)' && "Calculates the straight-line distance to the closest item."}
                    {spatialSettings.subTool === 'Heatmap Density' && "Visualizes the geographic concentration of features."}
                  </p>
                </div>
              </div>

              {spatialSettings.status && (
                <div className={`status-box ${spatialSettings.status.includes('Click') ? 'waiting' : 'success'}`}>
                  {spatialSettings.status.includes('Click') ? '📍 ' : '✔ '} {spatialSettings.status}
                </div>
              )}

              {spatialSettings.distanceResult && (
                <div className="result-highlight-card">
                  <span className="result-label">Nearest Distance</span>
                  <span className="result-value">{spatialSettings.distanceResult}</span>
                </div>
              )}
            </div>

            <div className="tool-fixed-footer">
              <button 
                className="secondary-btn"
                onClick={() => setSpatialSettings({...spatialSettings, status: '', lastRun: null, distanceResult: null, isWaitingForClick: false})}
              >
                Clear
              </button>
              <button 
                className="primary-btn" 
                onClick={() => {
                  const isProximity = spatialSettings.subTool === 'Proximity (Nearest)';
                  setSpatialSettings({
                    ...spatialSettings, 
                    lastRun: Date.now(), 
                    isWaitingForClick: isProximity,
                    status: isProximity ? 'Ready: Click any point on the map' : `${spatialSettings.subTool} applied successfully`,
                    distanceResult: null
                  });
                }}
              >
                {spatialSettings.subTool === 'Proximity (Nearest)' ? 'Start Tracking' : 'Run Analysis'}
              </button>
            </div>
          </div>
        );

      case 'time_compare':
        return (
          <TemporalFilterPanel 
            layersConfig={layersConfig}
            timelapseSettings={timelapseSettings}
            setTimelapseSettings={setTimelapseSettings}
            timeCompareTab={timeCompareTab}
            setTimeCompareTab={setTimeCompareTab}
          />
        );

      case 'identify':
        return (
          <div className="tool-content">
            <p>{t('identifyHint')}</p>
            <div className="info-box">{t('identifyActive')}</div>
          </div>
        );
        
      case 'split': {
        const allIdentifyLayers = [];
        layersConfig.forEach(l => {
          if (l.type === 'feature') {
            allIdentifyLayers.push({ id: l.id, title: l.title });
          } else if (l.type === 'map-image' && dynamicMapServerData[l.id]) {
            const mapData = dynamicMapServerData[l.id];
            if (mapData.metadata.layers) {
              mapData.metadata.layers.forEach(sub => {
                allIdentifyLayers.push({ id: `${l.id}_sub_${sub.id}`, title: sub.name || sub.title });
              });
            }
          }
        });

        const splitOptionsList = [
          { id: 'all-visible', title: 'All Visible Layers' },
          ...allIdentifyLayers
        ];

        return (
          <div className="tool-content">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'rgba(30, 60, 114, 0.05)', borderRadius: '8px', marginBottom: '20px', border: '1px solid rgba(30, 60, 114, 0.1)' }}>
              <span style={{ fontWeight: '700', color: '#1a2f4d', fontSize: '14px' }}>
                {isSplitModePersistent ? 'Swipe Active' : 'Enable Swipe'}
              </span>
              <button 
                onClick={() => setIsSplitModePersistent(!isSplitModePersistent)}
                className="no-stroke-btn"
                style={{ background: isSplitModePersistent ? '#cbd5e1' : 'linear-gradient(135deg, #df261c, #002D5D)', color: isSplitModePersistent ? '#1a2f4d' : 'white', padding: '8px 18px', fontSize: '13px', fontWeight: '600', borderRadius: '10px', border: 'none', transition: 'all 0.3s ease', cursor: 'pointer' }}
              >
                {isSplitModePersistent ? 'Disable' : 'Enable'}
              </button>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Swipe Direction</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[
                  { id: 'vertical',   label: '| Vertical Swipe' },
                  { id: 'horizontal', label: '— Horizontal Swipe' }
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setSwipeMode(id)}
                    style={{ 
                      flex: 1, 
                      padding: '7px 0', 
                      borderRadius: '6px', 
                      border: '1.5px solid', 
                      borderColor: swipeMode === id ? '#3b82f6' : '#e2e8f0', 
                      background: swipeMode === id ? 'linear-gradient(135deg, #f0f7ff, #e0efff)' : 'white', 
                      color: swipeMode === id ? '#1e3c72' : '#64748b', 
                      fontWeight: '700', 
                      fontSize: '11px', 
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d' }}>{t('splitLeftLayer')}</label>
              <div style={{ display: 'flex', gap: '8px', position: 'relative', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <CustomSelect 
                    options={splitOptionsList}
                    value={splitLayers.left} 
                    onChange={(val) => setSplitLayers(prev => ({ ...prev, left: val }))}
                    placeholder="Select left layers..."
                    multi={true}
                  />
                </div>
                <button 
                  className={`basemap-toggle-btn ${showSplitBasemap.left ? 'active' : ''}`}
                  onClick={() => setShowSplitBasemap(prev => ({ ...prev, left: !prev.left, right: false }))}
                  title="Change Basemap"
                >
                  <Map size={16} />
                </button>

                {showSplitBasemap.left && (
                  <div className="split-basemap-popup left">
                    {basemaps.map(bm => (
                      <div 
                        key={bm.id} 
                        className={`split-bm-item ${splitBasemaps.left === bm.id ? 'active' : ''}`}
                        onClick={() => { setSplitBasemaps(prev => ({ ...prev, left: bm.id })); setShowSplitBasemap(prev => ({ ...prev, left: false })); }}
                      >
                        {bm.title}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="form-group">
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d' }}>{t('splitRightLayer')}</label>
              <div style={{ display: 'flex', gap: '8px', position: 'relative', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <CustomSelect 
                    options={splitOptionsList}
                    value={splitLayers.right} 
                    onChange={(val) => setSplitLayers(prev => ({ ...prev, right: val }))}
                    placeholder="Select right layers..."
                    multi={true}
                  />
                </div>
                <button 
                  className={`basemap-toggle-btn ${showSplitBasemap.right ? 'active' : ''}`}
                  onClick={() => setShowSplitBasemap(prev => ({ ...prev, right: !prev.right, left: false }))}
                  title="Change Basemap"
                >
                  <Map size={16} />
                </button>

                {showSplitBasemap.right && (
                  <div className="split-basemap-popup right">
                    {basemaps.map(bm => (
                      <div 
                        key={bm.id} 
                        className={`split-bm-item ${splitBasemaps.right === bm.id ? 'active' : ''}`}
                        onClick={() => { setSplitBasemaps(prev => ({ ...prev, right: bm.id })); setShowSplitBasemap(prev => ({ ...prev, right: false })); }}
                      >
                        {bm.title}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      }

      case 'split_view': {
        const allIdentifyLayersView = [];
        layersConfig.forEach(l => {
          if (l.type === 'feature') {
            allIdentifyLayersView.push({ id: l.id, title: l.title });
          } else if (l.type === 'map-image' && dynamicMapServerData[l.id]) {
            const mapData = dynamicMapServerData[l.id];
            if (mapData.metadata.layers) {
              mapData.metadata.layers.forEach(sub => {
                allIdentifyLayersView.push({ id: `${l.id}_sub_${sub.id}`, title: sub.name || sub.title });
              });
            }
          }
        });

        const splitViewOptionsList = [
          { id: 'all-visible', title: 'All Visible Layers' },
          ...allIdentifyLayersView
        ];

        return (
          <div className="tool-content">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'rgba(30, 60, 114, 0.05)', borderRadius: '8px', marginBottom: '16px', border: '1px solid rgba(30, 60, 114, 0.1)' }}>
              <span style={{ fontWeight: '700', color: '#1a2f4d', fontSize: '14px' }}>
                {isSplitView ? 'Split View Active' : 'Enable Split View'}
              </span>
              <button 
                onClick={() => { setIsSplitView(!isSplitView); if (isSplitModePersistent) setIsSplitModePersistent(false); }}
                className="no-stroke-btn"
                style={{ background: isSplitView ? '#cbd5e1' : 'linear-gradient(135deg, #df261c, #002D5D)', color: isSplitView ? '#1a2f4d' : 'white', padding: '8px 18px', fontSize: '13px', fontWeight: '600', borderRadius: '10px', border: 'none', cursor: 'pointer' }}
              >
                {isSplitView ? 'Disable' : 'Enable'}
              </button>
            </div>

            {/* Left Side Controls */}
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#1a2f4d' }}>Left Side</label>
              <div style={{ display: 'flex', gap: '8px', position: 'relative', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <CustomSelect
                    options={splitViewOptionsList}
                    value={splitLayers.left}
                    onChange={(val) => setSplitLayers(prev => ({ ...prev, left: val }))}
                    placeholder="Select left layers..."
                    multi={true}
                  />
                </div>
                <button 
                  className={`basemap-toggle-btn ${showSplitBasemap.left ? 'active' : ''}`}
                  onClick={() => setShowSplitBasemap(prev => ({ ...prev, left: !prev.left, right: false }))}
                  title="Change Basemap"
                >
                  <Map size={16} />
                </button>
                <button 
                   className="view-mode-single-btn"
                   onClick={() => setSplitModes(prev => ({ ...prev, left: prev.left === '2D' ? '3D' : '2D' }))}
                   style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px', minWidth: '40px', fontSize: '12px', fontWeight: '800', color: '#1a2f4d', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                 >
                   {splitModes.left === '2D' ? '3D' : '2D'}
                 </button>

                {showSplitBasemap.left && (
                  <div className="split-basemap-popup left">
                    {basemaps.map(bm => (
                      <div 
                        key={bm.id} 
                        className={`split-bm-item ${splitBasemaps.left === bm.id ? 'active' : ''}`}
                        onClick={() => { setSplitBasemaps(prev => ({ ...prev, left: bm.id })); setShowSplitBasemap(prev => ({ ...prev, left: false })); }}
                      >
                        {bm.title}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Side Controls */}
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#1a2f4d' }}>Right Side</label>
              <div style={{ display: 'flex', gap: '8px', position: 'relative', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <CustomSelect
                    options={splitViewOptionsList}
                    value={splitLayers.right}
                    onChange={(val) => setSplitLayers(prev => ({ ...prev, right: val }))}
                    placeholder="Select right layers..."
                    multi={true}
                  />
                </div>
                <button 
                  className={`basemap-toggle-btn ${showSplitBasemap.right ? 'active' : ''}`}
                  onClick={() => setShowSplitBasemap(prev => ({ ...prev, right: !prev.right, left: false }))}
                  title="Change Basemap"
                >
                  <Map size={16} />
                </button>
                <button 
                  className="view-mode-single-btn"
                  onClick={() => setSplitModes(prev => ({ ...prev, right: prev.right === '2D' ? '3D' : '2D' }))}
                  style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px', minWidth: '40px', fontSize: '12px', fontWeight: '800', color: '#1a2f4d', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                >
                  {splitModes.right === '2D' ? '3D' : '2D'}
                </button>
              </div>

                {showSplitBasemap.right && (
                  <div className="split-basemap-popup right">
                    {basemaps.map(bm => (
                      <div 
                        key={bm.id} 
                        className={`split-bm-item ${splitBasemaps.right === bm.id ? 'active' : ''}`}
                        onClick={() => { setSplitBasemaps(prev => ({ ...prev, right: bm.id })); setShowSplitBasemap(prev => ({ ...prev, right: false })); }}
                      >
                        {bm.title}
                      </div>
                    ))}
                  </div>
                )}
              </div>

            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Extent Synchronization</label>
              <CustomSelect
                options={[
                  { value: 'both', title: 'Sync Both Views (pan + zoom)' },
                  { value: 'zoom', title: 'Sync Zoom Only' },
                  { value: 'none', title: 'Independent Views' }
                ]}
                value={syncMode}
                onChange={(val) => setSyncMode(val)}
                placeholder="Select sync mode..."
              />
            </div>
          </div>
        );
      }

      case 'navigation':
        return <NavigationPanel view={mapView} />;

      case 'search':
        return (
          <div className="tool-content">
            <div className="search-box">
              <input type="text" placeholder={t('searchPlaceholder')} className="tool-input" />
              <button className="primary-btn">{t('searchBtn')}</button>
            </div>
            <p className="hint">{t('searchHint')}</p>
          </div>
        );

      case 'measure':
        return <MeasurePanel view={mapView} />;

      case 'draw':
        return <DrawPanel view={mapView} />;

      case 'data_request':
        return (
          <DataRequestPanel 
            step={dataRequestStep}
            setStep={setDataRequestStep}
            aoi={requestAOI}
            intersectingLayers={intersectingLayers}
            selectedLayers={selectedLayersForRequest}
            setSelectedLayers={setSelectedLayersForRequest}
            onDrawingToolSelect={setActiveDrawingTool}
            activeDrawingTool={activeDrawingTool}
            lastRequestRef={lastRequestRef}
            onRequestSubmit={handleRequestSubmit}
            requestHistory={dataRequests}
            onReset={handleStartDataRequest}
          />
        );

      case 'add_data':
        return <AddDataPanel view={mapView} />;
      case 'print':
        return <PrintPanel view={mapView} />;

      case 'bookmark':
        return (
          <BookmarkPanel 
            view={mapView}
            layerVisibility={layerVisibility}
            setLayerVisibility={setLayerVisibility}
            is3D={is3D}
            setIs3D={setIs3D}
            currentBasemap={currentBasemap}
            setCurrentBasemap={setCurrentBasemap}
          />
        );

      default:
        return (
          <div className="tool-content">
            <p>{t('comingSoon')} <strong>{toolId}</strong> {t('comingSoonSuffix')}</p>
          </div>
        );
    }
  }

  return (
    <div className="app-container" data-swipe-mode={swipeMode}>
      <Header onMenuClick={() => setIsMobileMenuOpen(true)} />
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
          onSpatialResult={(dist) => setSpatialSettings(prev => ({ ...prev, distanceResult: dist, status: 'Nearest feature identified' }))}
          onArcadePreview={(val, debug) => setArcadeSettings(prev => ({ ...prev, preview: val, debugInfo: debug }))}
          splitLayers={splitLayers}
          splitBasemaps={splitBasemaps}
          basemap={currentBasemap}
          swipeMode={swipeMode}
          onSwipePositionChange={setSwipeInfo}
          onDataRequestAOIChange={(geometry, layers, isComplete) => {
            setRequestAOI(geometry);
            setIntersectingLayers(layers);
            if (isComplete) {
              setDataRequestStep('selection');
              setActiveDrawingTool(null);
            }
          }}
          dataRequestDrawingTool={activeDrawingTool}
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

      <BottomToolbar 
        activeTool={activeTool} 
        onToolSelect={handleToolSelect} 
        swipeMode={swipeMode} 
        isSplitView={isSplitView}
        isSplitModePersistent={isSplitModePersistent}
      />

      {/* Swipe Labels — mode-aware positioning (Vertical Divider = L/R, Horizontal Divider = T/B) */}
      {(isSplitModePersistent || (activeTool === 'time_compare' && timeCompareTab === 'swipe')) && (() => {
        const isVertical = swipeMode === 'vertical';
        const pos = swipeInfo.position ?? 50;

        const labelBase = {
          // Base styles are now in .swipe-label class in App.css
        };


        // Visual Vertical Line (L/R) corresponds to swipeMode="horizontal"
        // Visual Horizontal Line (T/B) corresponds to swipeMode="vertical"
        const isVisualVertical = swipeMode === 'horizontal';

        // Perfection: Use exactly 20px clearance for vertical, and 60px for horizontal to clear the circular handle
        const clearance = isVisualVertical ? '20px' : '60px';

        const labelA = isVisualVertical
          ? { top: '85px', left: `${pos}%`, transform: `translate3d(calc(-100% - ${clearance}), 0, 0)` } // Left
          : { left: '50%', top: `${pos}%`, transform: `translate3d(-50%, calc(-100% - ${clearance}), 0)` }; // Top

        const labelB = isVisualVertical
          ? { top: '85px', left: `${pos}%`, transform: `translate3d(${clearance}, 0, 0)` } // Right
          : { left: '50%', top: `${pos}%`, transform: `translate3d(-50%, ${clearance}, 0)` }; // Bottom

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
          labelAText = `${sideA}: ${layersConfig.find(l => l.id === splitLayers.left)?.title || 'Left Layer'}`;
          labelBText = `${sideB}: ${layersConfig.find(l => l.id === splitLayers.right)?.title || 'Right Layer'}`;
        }

        return (
          <div className="swipe-labels-container" style={{ position: 'fixed', top: '60px', bottom: 0, left: 0, right: 0, zIndex: 1000, pointerEvents: 'none' }}>
            <div className="swipe-label" style={labelA}>
              {labelAText}
            </div>
            <div className="swipe-label" style={labelB}>
              {labelBText}
            </div>
          </div>
        );
      })()}

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

            {/* Bottom Sheet Drawer */}
            <motion.div
              className="mobile-drawer-container"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            >
              {/* Drag Handle Indicator */}
              <div className="mobile-drawer-handle" />

              {/* Drawer Header */}
              <div className="mobile-drawer-header">
                <h3>{lang === 'AR' ? 'عارض الخرائط الذكي BSDI' : 'BSDI Smart Map Viewer'}</h3>
                
                <div className="mobile-drawer-header-actions">
                  {/* Language Toggle */}
                  <button 
                    className="mobile-drawer-lang-toggle" 
                    onClick={toggleLanguage}
                  >
                    {t('langToggle')}
                  </button>
                  
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
                        <div className="mobile-tool-icon-wrapper">
                          <Icon />
                        </div>
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
