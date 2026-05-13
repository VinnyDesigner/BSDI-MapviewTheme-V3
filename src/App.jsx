import React, { useState, useEffect, useCallback } from 'react'
import ArcGISMap from './components/MapView'
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
import { layersConfig } from './layers'
import { ewaWddTree } from './ewa_wdd_config'
import { LanguageProvider, useLanguage } from './context/LanguageContext'
import { translations } from './i18n/translations'
import './App.css'

import {
  Layers, Search, Navigation, Ruler, Pencil,
  Box, Database, Globe, Printer, Bookmark, Info,
  Columns2, ChevronRight, ChevronLeft, MousePointer2, Square, Hexagon,
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
  const { t, lang } = useLanguage();

  const [activeTool, setActiveTool] = useState(null)
  const [pinnedTools, setPinnedTools] = useState([])
  const [mapView, setMapView] = useState(null)
  const [is3D, setIs3D] = useState(false)
  const [layerVisibility, setLayerVisibility] = useState(
    layersConfig.reduce((acc, layer) => ({ ...acc, [layer.id]: layer.visible }), {})
  )
  
  const [splitLayers, setSplitLayers] = useState({
    left: layersConfig[0]?.id || '',
    right: layersConfig[1]?.id || layersConfig[0]?.id || ''
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
    applyTo: 'Styling',
    layerId: 'heritage-sites',
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

  const [layerSearch, setLayerSearch] = useState('');
  const [layerOrder, setLayerOrder] = useState(() => layersConfig.map(l => l.id));
  const [dragOverId, setDragOverId] = useState(null);
  const dragItem = React.useRef(null);
  const dragOverItem = React.useRef(null);

  // Identify State
  const [identifySettings, setIdentifySettings] = useState({
    mode: 'point', // 'point', 'rectangle', 'polygon'
    selectedLayerId: 'all',
    results: null, // { total: number, grouped: { [layerName]: features[] } }
    isQuerying: false
  });
  
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
    layerId: 'blocks-layer',
    currentYear: 2024,
    fromYear: 2018,
    toYear: 2024,
    startYear: 2018,
    endYear: 2024,
    isPlaying: false,
    speed: 'Medium',
    loop: true,
    mode: 'range', // 'single' | 'range'
    playbackInterval: 'Yearly',
    lastApply: 0
  });
  const [timeCompareTab, setTimeCompareTab] = useState('slider'); // 'slider' | 'swipe'
  const [swipeMode, setSwipeMode] = useState('vertical'); // 'vertical' | 'horizontal'
  const [swipeInfo, setSwipeInfo] = useState({ position: 50, viewWidth: 0, viewHeight: 0 });
  const [currentBasemap, setCurrentBasemap] = useState('streets-navigation-vector');

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

  const toggleLayer = (id) =>
    setLayerVisibility(prev => ({ ...prev, [id]: !prev[id] }))

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
        const orderedLayers = layerOrder.map(id => layersConfig.find(l => l.id === id)).filter(Boolean);
        const filteredLayers = orderedLayers.filter(l =>
          l.title.toLowerCase().includes(layerSearch.toLowerCase())
        );
        const allVisible = filteredLayers.length > 0 && filteredLayers.every(l => layerVisibility[l.id]);

        return (
          <div className="tool-content" style={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Search Box */}
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

            {/* Select All Row */}
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

            <div className="layer-list" style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
              {filteredLayers.map(layer => {
                if (layer.hasTree && layer.id === 'ewa-wdd') {
                  const dsState = getDatasetState();
                  const rootIndeterminate = dsState.indeterminate || (dsState.checked !== layerVisibility[layer.id]);

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
                      {/* Root Layer Row */}
                      <div 
                        className={`layer-card ${layerVisibility[layer.id] ? 'active' : ''} ${treeExpanded[layer.id] ? 'tree-active' : ''}`} 
                        style={{ cursor: 'pointer' }}
                        onClick={() => setTreeExpanded(prev => ({ ...prev, [layer.id]: !prev[layer.id] }))}
                      >
                        <div className="layer-card-label" onClick={(e) => e.stopPropagation()}>
                          <span className="layer-drag-handle" onMouseDown={(e) => e.stopPropagation()} title="Drag to reorder">
                            <DragHandle />
                          </span>
                          <input 
                            type="checkbox" 
                            className={`custom-checkbox ${rootIndeterminate ? 'indeterminate' : ''}`}
                            checked={layerVisibility[layer.id]}
                            onChange={(e) => handleToggleRoot(e.target.checked)}
                          />
                          <span className="layer-card-name">{layer.title}</span>
                        </div>
                        <div className="tree-expand-icon-wrapper">
                          <ChevronRight size={14} className={`tree-expand-icon ${treeExpanded[layer.id] ? 'expanded' : ''}`} />
                        </div>
                      </div>

                      {treeExpanded[layer.id] && (
                        <div className="tree-children">
                          {/* Dataset Node (Level 1) */}
                          <div className="tree-row" onClick={() => setTreeExpanded(prev => ({ ...prev, 'dataset': !prev['dataset'] }))}>
                            <div className="tree-line-spacer"><div className="tree-line-v" /><div className="tree-line-h" /></div>
                            <div className="tree-checkbox-wrapper">
                              <input 
                                type="checkbox" 
                                className={`custom-checkbox ${dsState.indeterminate ? 'indeterminate' : ''}`}
                                checked={dsState.checked}
                                onChange={(e) => { e.stopPropagation(); handleToggleDataset(e.target.checked); }}
                              />
                            </div>
                            <span className="tree-label tree-label-category" style={{ color: '#1e3c72' }}>{ewaWddTree.dataset}</span>
                            <div className="tree-expand-icon-wrapper">
                              <ChevronRight size={14} className={`tree-expand-icon ${treeExpanded['dataset'] ? 'expanded' : ''}`} />
                            </div>
                          </div>

                          {treeExpanded['dataset'] && ewaWddTree.categories.map((cat, catIdx) => {
                            const isExpanded = treeExpanded[cat.title];
                            const catState = getCategoryState(cat);

                            return (
                              <React.Fragment key={cat.title}>
                                {/* Category Row (Level 2) */}
                                <div className="tree-row" onClick={() => setTreeExpanded(prev => ({ ...prev, [cat.title]: !prev[cat.title] }))}>
                                  <div className="tree-line-spacer"><div className="tree-line-v" /></div>
                                  <div className="tree-line-spacer"><div className="tree-line-v" /><div className="tree-line-h" /></div>
                                  <div className="tree-checkbox-wrapper">
                                    <input 
                                      type="checkbox" 
                                      className={`custom-checkbox ${catState.indeterminate ? 'indeterminate' : ''}`}
                                      checked={catState.checked}
                                      onChange={(e) => { e.stopPropagation(); handleToggleCategory(cat.title, e.target.checked); }}
                                    />
                                  </div>
                                  <span className="tree-label tree-label-category">{cat.title}</span>
                                  <div className="tree-expand-icon-wrapper">
                                    {cat.features.length > 0 && (
                                      <ChevronRight size={14} className={`tree-expand-icon ${isExpanded ? 'expanded' : ''}`} />
                                    )}
                                  </div>
                                </div>

                                {isExpanded && cat.features.map(feat => (
                                  /* Leaf Row (Level 3) */
                                  <div key={feat} className="tree-row">
                                    <div className="tree-line-spacer"><div className="tree-line-v" /></div>
                                    <div className="tree-line-spacer"><div className="tree-line-v" /></div>
                                    <div className="tree-line-spacer"><div className="tree-line-v" /><div className="tree-line-h" /></div>
                                    <div className="tree-checkbox-wrapper">
                                      <input 
                                        type="checkbox" 
                                        className="custom-checkbox"
                                        checked={!!treeVisibility[`${cat.title}_${feat}`]}
                                        onChange={(e) => {
                                          const checked = e.target.checked;
                                          updateTreeVisibility({ [`${cat.title}_${feat}`]: checked });
                                        }}
                                      />
                                    </div>
                                    <div className="tree-symbol-wrapper">
                                      <div className={`symbol-${cat.geometry === 'point' ? 'dot' : cat.geometry === 'line' ? 'line' : 'square'}`} />
                                    </div>
                                    <span className="tree-label tree-label-leaf">{feat}</span>
                                    <div className="tree-expand-icon-wrapper" />
                                  </div>
                                ))}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    key={layer.id}
                    className={`layer-card ${layerVisibility[layer.id] ? 'active' : ''} ${dragOverId === layer.id ? 'drag-over' : ''}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, layer.id)}
                    onDragOver={(e) => handleDragOver(e, layer.id)}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                  >
                    <label className="layer-card-label">
                      <span className="layer-drag-handle" onMouseDown={(e) => e.stopPropagation()} title="Drag to reorder">
                        <DragHandle />
                      </span>
                      <input
                        type="checkbox"
                        checked={layerVisibility[layer.id]}
                        onChange={() => toggleLayer(layer.id)}
                      />
                      <span className="layer-card-name">{layer.title}</span>
                    </label>
                    <div className="layer-card-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="layer-card-arrow" onClick={() => console.log('Details for', layer.id)}>
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {filteredLayers.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: '13px' }}>
                  No layers found matching "{layerSearch}"
                </div>
              )}
            </div>
          </div>
        );

      case 'identify':
        const visibleLayers = layersConfig.filter(l => layerVisibility[l.id]);
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
                    {visibleLayers.map(l => (
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

                <div className="identify-instruction" style={{ textAlign: 'center', padding: '12px', color: '#64748b', fontSize: '13px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #e2e8f0' }}>
                  Click on the map to identify features
                </div>

                {identifySettings.isQuerying && (
                  <div style={{ textAlign: 'center', padding: '20px', color: '#df261c', fontSize: '13px', fontWeight: '600' }}>
                    Querying layers...
                  </div>
                )}
              </>
            ) : (
              <div className="identify-results">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', color: '#1a2f4d' }}>
                    Identify Results ({identifySettings.results.total} Found)
                  </h4>
                  <button 
                    className="layer-clear-btn"
                    onClick={() => setIdentifySettings(prev => ({ ...prev, results: null }))}
                  >
                    Clear
                  </button>
                </div>

                <div className="results-list" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
                  {Object.entries(identifySettings.results.grouped).map(([layerName, features]) => (
                    <div key={layerName} style={{ marginBottom: '16px' }}>
                      <div style={{ padding: '6px 10px', background: '#f8fafc', borderRadius: '4px', fontWeight: '600', fontSize: '12px', color: '#1e3c72', marginBottom: '8px' }}>
                        {layerName}
                      </div>
                      {features.map((f, i) => (
                        <div key={i} className="feature-item" style={{ padding: '8px', border: '1px solid #f1f5f9', borderRadius: '6px', marginBottom: '8px', fontSize: '12px' }}>
                          {Object.entries(f.attributes).map(([key, val]) => (
                            <div key={key} style={{ display: 'flex', marginBottom: '2px' }}>
                              <span style={{ color: '#94a3b8', width: '40%', flexShrink: 0 }}>{key}:</span>
                              <span style={{ color: '#1a2f4d', fontWeight: '500' }}>{String(val)}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                <button 
                  className="tool-btn" 
                  style={{ width: '100%', marginTop: '16px', background: '#1e3c72', color: 'white', padding: '10px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
                  onClick={() => {
                    const data = JSON.stringify(identifySettings.results, null, 2);
                    const blob = new Blob([data], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'identify_results.json';
                    link.click();
                  }}
                >
                  Export as JSON
                </button>
              </div>
            )}
          </div>
        );

      case 'blend':
        return (
          <div className="tool-content">
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>
                Base Layer
              </label>
              <CustomSelect 
                options={[...basemaps, ...layersConfig]}
                value={blendSettings.baseLayerId}
                onChange={(val) => setBlendSettings(prev => ({ ...prev, baseLayerId: val }))}
                placeholder="Select base layer..."
              />
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>
                Overlay Layer
              </label>
              <CustomSelect 
                options={layersConfig}
                value={blendSettings.overlayLayerId}
                onChange={(val) => setBlendSettings(prev => ({ ...prev, overlayLayerId: val }))}
                placeholder="Select overlay layer..."
              />
            </div>

            <div className="form-group" style={{ marginBottom: '12px' }}>
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
                onChange={(e) => setBlendSettings(prev => ({ ...prev, opacity: parseFloat(e.target.value) }))}
                style={{ 
                  width: '100%', 
                  accentColor: '#DF261C',
                  cursor: 'pointer'
                }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>
                Blend Mode
              </label>
              <CustomSelect 
                options={[
                  { id: 'normal', title: 'Normal' },
                  { id: 'multiply', title: 'Multiply' },
                  { id: 'overlay', title: 'Overlay' },
                  { id: 'screen', title: 'Screen' },
                  { id: 'color-burn', title: 'Color Burn' },
                  { id: 'destination-over', title: 'Destination Over' },
                  { id: 'lighter', title: 'Lighter' }
                ]}
                value={blendSettings.blendMode}
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
          <div className="tool-content-full">
            <div className="tool-scroll-body" style={{ padding: '0' }}>
              {/* SECTION 1: LAYER SELECTION */}
              <div className="workflow-section" style={{ padding: '0' }}>
                <div className="form-group-alt">
                  <label className="input-label-mini">Select Temporal Dataset</label>
                  <CustomSelect 
                    options={layersConfig
                      .filter(l => l.timeEnabled)
                      .map(l => ({
                        id: l.id,
                        title: `${l.title} (${l.startYear}–${l.endYear})`
                      }))
                    }
                    value={timelapseSettings.layerId}
                    onChange={(val) => {
                      const layer = layersConfig.find(l => l.id === val);
                      if (!layer) return;
                      setTimelapseSettings({
                        ...timelapseSettings, 
                        layerId: val,
                        startYear: layer.startYear,
                        endYear: layer.endYear,
                        fromYear: layer.startYear,
                        toYear: layer.endYear,
                        isPlaying: false
                      });
                    }}
                    placeholder="Select Dataset..."
                  />
                </div>

                {(() => {
                  const activeLayer = layersConfig.find(l => l.id === timelapseSettings.layerId);
                  if (!activeLayer) return null;
                  return (
                    <div className="metadata-card-refined">
                      <div className="metadata-row">
                        <span className="meta-label">LAYER</span>
                        <span className="meta-value">{activeLayer.title}</span>
                      </div>
                      <div className="metadata-row">
                        <span className="meta-label">DATE / TIME FIELD</span>
                        <span className="meta-value">{activeLayer.timeField || 'SURVEY_YEAR'}</span>
                      </div>
                      <div className="metadata-row">
                        <span className="meta-label">FILTER METHOD</span>
                        <span className="meta-value">{activeLayer.filterMethod || 'definitionExpression'}</span>
                      </div>
                      <div className="metadata-row">
                        <span className="meta-label">AVAILABLE RANGE</span>
                        <span className="meta-value">{activeLayer.startYear} → {activeLayer.endYear}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* SECTION 2: TIME RANGE CONFIG */}
              <div className="workflow-section-boxed">
                <div className="section-header-clean">
                  <span className="section-title-alt">SET TIME RANGE</span>
                </div>

                <div className="timeline-cards-flex">
                  <div className="timeline-card-refined">
                    <div className="card-tag-alt">FROM</div>
                    <div className="card-year-alt">{timelapseSettings.fromYear}</div>
                    <div className="card-date-alt">Jan 1, {timelapseSettings.fromYear}</div>
                  </div>
                  <div className="timeline-card-refined">
                    <div className="card-tag-alt">TO</div>
                    <div className="card-year-alt">{timelapseSettings.toYear}</div>
                    <div className="card-date-alt">Dec 31, {timelapseSettings.toYear}</div>
                  </div>
                </div>

                <div className="range-inputs-boxed">
                  <div className="range-inputs-flex">
                    <div className="form-group-compact">
                      <label className="input-label-mini">From</label>
                      <select 
                        className="tool-select-mini" 
                        value={timelapseSettings.fromYear}
                        onChange={(e) => setTimelapseSettings({...timelapseSettings, fromYear: Number(e.target.value)})}
                      >
                        {Array.from({ length: timelapseSettings.endYear - timelapseSettings.startYear + 1 }, (_, i) => timelapseSettings.startYear + i).map(year => (
                          <option key={year} value={year}>{year}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group-compact">
                      <label className="input-label-mini">To</label>
                      <select 
                        className="tool-select-mini" 
                        value={timelapseSettings.toYear}
                        onChange={(e) => setTimelapseSettings({...timelapseSettings, toYear: Number(e.target.value)})}
                      >
                        {Array.from({ length: timelapseSettings.endYear - timelapseSettings.startYear + 1 }, (_, i) => timelapseSettings.startYear + i).map(year => (
                          <option key={year} value={year}>{year}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-group-alt" style={{ marginTop: '12px' }}>
                    <label className="input-label-mini">Playback Interval</label>
                    <CustomSelect 
                      options={["Yearly", "Monthly", "Quarterly"]}
                      value={timelapseSettings.playbackInterval}
                      onChange={(val) => setTimelapseSettings({...timelapseSettings, playbackInterval: val})}
                    />
                  </div>
                </div>

                <div className="info-notification-refined" style={{ marginTop: '12px' }}>
                  <Info size={14} />
                  <span>Map updates dynamically as you progress.</span>
                </div>
              </div>

              {/* SECTION 3: PLAYBACK & ACTIONS */}
              <div className="workflow-section" style={{ padding: '0 1px 1px 1px' }}>
                <div className="playback-segmented-controls">
                  <button 
                    className="segmented-btn-side"
                    title="Previous"
                    onClick={() => setTimelapseSettings(prev => ({ 
                      ...prev, 
                      toYear: Math.max(prev.startYear, prev.toYear - 1), 
                      isPlaying: false 
                    }))}
                  >
                    <ChevronLeft size={20} />
                  </button>
                  
                  <button 
                    className={`segmented-btn-primary ${timelapseSettings.isPlaying ? 'active' : ''}`}
                    onClick={() => setTimelapseSettings(prev => ({ ...prev, isPlaying: !prev.isPlaying }))}
                  >
                    {timelapseSettings.isPlaying ? (
                      <Pause size={22} fill="currentColor" />
                    ) : (
                      <Play size={22} fill="currentColor" />
                    )}
                  </button>

                  <button 
                    className="segmented-btn-side"
                    title="Next"
                    onClick={() => setTimelapseSettings(prev => ({ 
                      ...prev, 
                      toYear: Math.min(prev.endYear, prev.toYear + 1), 
                      isPlaying: false 
                    }))}
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>

              </div>
            </div>

            <div className="time-panel-actions-clean">
              <button className="reset-btn-secondary" onClick={() => {
                const layer = layersConfig.find(l => l.id === timelapseSettings.layerId);
                setTimelapseSettings({
                  ...timelapseSettings,
                  fromYear: layer?.startYear || 2018,
                  toYear: layer?.endYear || 2024,
                  isPlaying: false
                });
              }}>
                Reset
              </button>
              <button 
                className="apply-btn-gradient"
                onClick={() => {
                  setTimelapseSettings(prev => ({ ...prev, lastApply: Date.now() }));
                }}
              >
                Apply Time Filter
              </button>
            </div>
          </div>
        );

      case 'identify':
        return (
          <div className="tool-content">
            <p>{t('identifyHint')}</p>
            <div className="info-box">{t('identifyActive')}</div>
          </div>
        );
        
      case 'split':
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
                    style={{ flex: 1, padding: '7px 0', borderRadius: '6px', border: '1.5px solid', borderColor: swipeMode === id ? '#1e3c72' : '#e2e8f0', background: swipeMode === id ? 'linear-gradient(135deg, #1e3c72, #2a5298)' : 'white', color: swipeMode === id ? 'white' : '#1a2f4d', fontWeight: '700', fontSize: '11px', cursor: 'pointer' }}
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
                    options={layersConfig}
                    value={splitLayers.left} 
                    onChange={(val) => setSplitLayers(prev => ({ ...prev, left: val }))}
                    placeholder="Select left layer..."
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
                    options={layersConfig}
                    value={splitLayers.right} 
                    onChange={(val) => setSplitLayers(prev => ({ ...prev, right: val }))}
                    placeholder="Select right layer..."
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

      case 'split_view':
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
                    options={layersConfig}
                    value={splitLayers.left}
                    onChange={(val) => setSplitLayers(prev => ({ ...prev, left: val }))}
                    placeholder="Select left layer..."
                  />
                </div>
                <button 
                  className={`basemap-toggle-btn ${showSplitBasemap.left ? 'active' : ''}`}
                  onClick={() => setShowSplitBasemap(prev => ({ ...prev, left: !prev.left, right: false }))}
                  title="Change Basemap"
                >
                  <Map size={16} />
                </button>
                <div className="view-mode-toggle" style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '2px' }}>
                  <button 
                    onClick={() => setSplitModes(prev => ({ ...prev, left: '2D' }))}
                    style={{ border: 'none', background: splitModes.left === '2D' ? 'white' : 'transparent', color: '#1a2f4d', padding: '4px 8px', fontSize: '11px', fontWeight: '700', borderRadius: '6px', cursor: 'pointer', boxShadow: splitModes.left === '2D' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                  >2D</button>
                  <button 
                    onClick={() => setSplitModes(prev => ({ ...prev, left: '3D' }))}
                    style={{ border: 'none', background: splitModes.left === '3D' ? 'white' : 'transparent', color: '#1a2f4d', padding: '4px 8px', fontSize: '11px', fontWeight: '700', borderRadius: '6px', cursor: 'pointer', boxShadow: splitModes.left === '3D' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                  >3D</button>
                </div>

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
                    options={layersConfig}
                    value={splitLayers.right}
                    onChange={(val) => setSplitLayers(prev => ({ ...prev, right: val }))}
                    placeholder="Select right layer..."
                  />
                </div>
                <button 
                  className={`basemap-toggle-btn ${showSplitBasemap.right ? 'active' : ''}`}
                  onClick={() => setShowSplitBasemap(prev => ({ ...prev, right: !prev.right, left: false }))}
                  title="Change Basemap"
                >
                  <Map size={16} />
                </button>
                <div className="view-mode-toggle" style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '2px' }}>
                  <button 
                    onClick={() => setSplitModes(prev => ({ ...prev, right: '2D' }))}
                    style={{ border: 'none', background: splitModes.right === '2D' ? 'white' : 'transparent', color: '#1a2f4d', padding: '4px 8px', fontSize: '11px', fontWeight: '700', borderRadius: '6px', cursor: 'pointer', boxShadow: splitModes.right === '2D' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                  >2D</button>
                  <button 
                    onClick={() => setSplitModes(prev => ({ ...prev, right: '3D' }))}
                    style={{ border: 'none', background: splitModes.right === '3D' ? 'white' : 'transparent', color: '#1a2f4d', padding: '4px 8px', fontSize: '11px', fontWeight: '700', borderRadius: '6px', cursor: 'pointer', boxShadow: splitModes.right === '3D' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                  >3D</button>
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
      <Header />
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
      {isSplitModePersistent && (() => {
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

        const labelAText = isVisualVertical ? 'Left' : 'Top';
        const labelBText = isVisualVertical ? 'Right' : 'Bottom';

        return (
          <div style={{ position: 'fixed', top: '60px', bottom: 0, left: 0, right: 0, zIndex: 1000, pointerEvents: 'none' }}>
            <div className="swipe-label" style={labelA}>
              {labelAText}: {layersConfig.find(l => l.id === splitLayers.left)?.title}
            </div>
            <div className="swipe-label" style={labelB}>
              {labelBText}: {layersConfig.find(l => l.id === splitLayers.right)?.title}
            </div>
          </div>
        );
      })()}

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
