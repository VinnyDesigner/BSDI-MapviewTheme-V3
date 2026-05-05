import React, { useState, useEffect } from 'react'
import ArcGISMap from './components/MapView'
import BottomToolbar from './components/BottomToolbar'
import SidePanel from './components/SidePanel'
import Header from './components/Header'
import MapControls from './components/MapControls'
import MapInfoWidget from './components/MapInfoWidget'
import DualMapView from './components/DualMapView'
import { layersConfig } from './layers'
import { ewaWddTree } from './ewa_wdd_config'
import { LanguageProvider, useLanguage } from './context/LanguageContext'
import { translations } from './i18n/translations'
import './App.css'

import {
  Layers, Search, Navigation, Ruler, Pencil,
  Box, Database, Globe, Printer, Bookmark, Info,
  Columns2, ChevronRight, MousePointer2, Square, Hexagon
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
  const [isSplitModePersistent, setIsSplitModePersistent] = useState(false);
  const [isSplitView, setIsSplitView] = useState(false);
  const [syncMode, setSyncMode] = useState('both'); // 'both' | 'zoom' | 'none'
  const [blendSettings, setBlendSettings] = useState({
    baseLayerId: 'satellite-present',
    overlayLayerId: 'historical-1990',
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
    layerId: 'blocks-bahrain',
    currentYear: 2024,
    fromYear: 2018,
    toYear: 2024,
    startYear: 2018,
    endYear: 2024,
    isPlaying: false,
    speed: 'Medium',
    loop: true,
    mode: 'range' // 'single' | 'range'
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
        activeTool !== 'identify' && // Keep Identify panel open during map interaction
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
                    <button className="layer-card-arrow" onClick={() => console.log('Details for', layer.id)}>
                      <ChevronRight size={14} />
                    </button>
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
                <div className="form-group" style={{ marginBottom: '20px' }}>
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

                <div className="form-group" style={{ marginBottom: '24px' }}>
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
            <p className="description" style={{ marginBottom: '20px', color: '#64748b', fontSize: '13px' }}>
              Create complex visual effects by blending two map layers together.
            </p>
            
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>
                Base Layer
              </label>
              <select 
                className="tool-select" 
                value={blendSettings.baseLayerId}
                onChange={(e) => setBlendSettings(prev => ({ ...prev, baseLayerId: e.target.value }))}
              >
                {layersConfig.map(l => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>
                Overlay Layer
              </label>
              <select 
                className="tool-select" 
                value={blendSettings.overlayLayerId}
                onChange={(e) => setBlendSettings(prev => ({ ...prev, overlayLayerId: e.target.value }))}
              >
                {layersConfig.map(l => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
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

            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>
                Blend Mode
              </label>
              <select 
                className="tool-select" 
                value={blendSettings.blendMode}
                onChange={(e) => setBlendSettings(prev => ({ ...prev, blendMode: e.target.value }))}
              >
                <option value="normal">Normal</option>
                <option value="multiply">Multiply</option>
                <option value="overlay">Overlay</option>
                <option value="screen">Screen</option>
                <option value="color-burn">Color Burn</option>
                <option value="destination-over">Destination Over</option>
                <option value="lighter">Lighter</option>
              </select>
            </div>
          </div>
        );

      case 'arcade':
        return (
          <div className="tool-content" style={{ paddingBottom: '16px' }}>
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Apply To</label>
              <select 
                className="tool-select"
                value={arcadeSettings.applyTo}
                onChange={(e) => setArcadeSettings({...arcadeSettings, applyTo: e.target.value})}
              >
                <option>Styling</option>
                <option>Labels</option>
                <option>Popup</option>
                <option>Filtering</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Target Layer</label>
              <select 
                className="tool-select"
                value={arcadeSettings.layerId}
                onChange={(e) => setArcadeSettings({...arcadeSettings, layerId: e.target.value})}
              >
                {layersConfig.map(l => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Quick Templates</label>
              <select 
                className="tool-select"
                value={arcadeSettings.template}
                onChange={(e) => {
                  const val = e.target.value;
                  let expr = '';
                  if (val === 'Population Density') expr = 'return $feature.population / $feature.area;';
                  if (val === 'Highlight Coastal') expr = "return When($feature.type == 'Coastal', 'High', 'Low');";
                  if (val === 'Conditional Label') expr = "if ($feature.status == 1) { return 'Active'; } else { return 'Inactive'; }";
                  setArcadeSettings({...arcadeSettings, template: val, expression: expr});
                }}
              >
                <option value="">-- Select Template --</option>
                <option>Population Density</option>
                <option>Highlight Coastal</option>
                <option>Conditional Label</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Field Picker</label>
              <div className="field-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {['$feature.name', '$feature.type', '$feature.area', '$feature.population'].map(field => (
                  <button 
                    key={field}
                    onClick={() => setArcadeSettings({...arcadeSettings, expression: arcadeSettings.expression + ' ' + field})}
                    style={{ 
                      padding: '4px 10px', 
                      background: '#f1f5f9', 
                      border: '1px solid #e2e8f0', 
                      borderRadius: '6px', 
                      fontSize: '11px', 
                      color: '#1e3c72',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    {field}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Expression Editor</label>
              <textarea 
                className="tool-input"
                style={{ height: '100px', padding: '12px', fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' }}
                placeholder="Write Arcade expression here..."
                value={arcadeSettings.expression}
                onChange={(e) => setArcadeSettings({...arcadeSettings, expression: e.target.value})}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <div style={{ 
                padding: '12px', 
                background: arcadeSettings.preview.includes('Error') ? '#fff1f2' : '#f8fafc', 
                borderRadius: '8px', 
                border: '1px solid ' + (arcadeSettings.preview.includes('Error') ? '#fecaca' : '#e2e8f0') 
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Output Preview</span>
                  <button 
                    onClick={() => setArcadeSettings(prev => ({ ...prev, showDebug: !prev.showDebug }))}
                    style={{ fontSize: '10px', background: 'none', border: 'none', color: '#1e3c72', cursor: 'pointer', fontWeight: '600' }}
                  >
                    {arcadeSettings.showDebug ? 'Hide Debug' : 'Show Debug'}
                  </button>
                </div>
                <span style={{ 
                  fontSize: '14px', 
                  fontWeight: '800', 
                  color: arcadeSettings.preview.includes('Error') ? '#be123c' : '#1a2f4d', 
                  display: 'block' 
                }}>
                  {arcadeSettings.expression 
                    ? (arcadeSettings.preview.includes('Error') ? `❌ ${arcadeSettings.preview}` : `Result: ${arcadeSettings.preview}`) 
                    : 'Enter expression to see preview'}
                </span>
              </div>
            </div>

            {arcadeSettings.showDebug && arcadeSettings.debugInfo && (
              <div style={{ marginBottom: '16px', padding: '10px', background: '#1e293b', color: '#cbd5e1', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace', maxHeight: '100px', overflowY: 'auto' }}>
                <div style={{ color: '#94a3b8', marginBottom: '4px', borderBottom: '1px solid #334155', paddingBottom: '2px' }}>Sample Feature Attributes:</div>
                {Object.entries(arcadeSettings.debugInfo).map(([k, v]) => (
                  <div key={k}>{k}: {String(v)}</div>
                ))}
              </div>
            )}

            {arcadeSettings.applyTo === 'Styling' && arcadeSettings.lastApplied && (
              <div style={{ marginBottom: '20px', padding: '12px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#1a2f4d', fontWeight: '700' }}>Color Scale (Legend)</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ height: '12px', flex: 1, background: 'linear-gradient(to right, #f7fcf0, #084081)', borderRadius: '4px' }}></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '10px', color: '#64748b' }}>
                  <span>Low / 0</span>
                  <span>High / 100+</span>
                </div>
              </div>
            )}

            <div className="arcade-guide" style={{ marginBottom: '20px', padding: '12px', background: 'rgba(30, 60, 114, 0.03)', borderRadius: '8px', border: '1px dashed rgba(30, 60, 114, 0.2)' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#1e3c72', fontWeight: '700' }}>Where to see results:</h4>
              <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: '11px', color: '#64748b', lineHeight: '1.6' }}>
                <li><b>Popup:</b> Click on any feature on the map</li>
                <li><b>Styling:</b> Observe color changes based on the legend above</li>
                <li><b>Labels:</b> Check text appearing over features</li>
                <li><b>Filtering:</b> Features will show/hide dynamically</li>
              </ul>
            </div>

            {arcadeSettings.status && (
              <div style={{ 
                marginBottom: '16px', 
                padding: '12px', 
                background: arcadeSettings.status.includes('Error') ? '#fef2f2' : '#f0fdf4',
                color: arcadeSettings.status.includes('Error') ? '#991b1b' : '#166534',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '700',
                textAlign: 'center',
                border: '1px solid' + (arcadeSettings.status.includes('Error') ? '#fee2e2' : '#dcfce7'),
                animation: 'fadeIn 0.3s ease'
              }}>
                ✔ {arcadeSettings.status}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="primary-btn" 
                style={{ 
                  flex: 1, 
                  padding: '10px', 
                  borderRadius: '10px', 
                  background: arcadeSettings.preview.includes('Error') || !arcadeSettings.expression ? '#e2e8f0' : 'linear-gradient(135deg, #df261c, #002d5d)', 
                  color: arcadeSettings.preview.includes('Error') || !arcadeSettings.expression ? '#64748b' : 'white', 
                  fontWeight: '700', 
                  border: 'none', 
                  cursor: arcadeSettings.preview.includes('Error') || !arcadeSettings.expression ? 'not-allowed' : 'pointer',
                  opacity: arcadeSettings.preview.includes('Error') || !arcadeSettings.expression ? 0.8 : 1
                }}
                disabled={!arcadeSettings.expression || arcadeSettings.preview.includes('Error')}
                onClick={() => {
                  const hintMap = {
                    'Popup': 'Click feature to see output',
                    'Styling': 'Check map color changes',
                    'Labels': 'Labels appear on map',
                    'Filtering': 'Features will hide/show'
                  };
                  setArcadeSettings(prev => ({ 
                    ...prev, 
                    lastApplied: Date.now(),
                    status: `${prev.applyTo} applied successfully — ${hintMap[prev.applyTo]}`
                  }));
                }}
              >
                Apply
              </button>
              <button 
                className="secondary-btn"
                style={{ flex: 1, padding: '10px', borderRadius: '10px', background: '#f1f5f9', color: '#1a2f4d', fontWeight: '700', border: '1px solid #e2e8f0', cursor: 'pointer' }}
                onClick={() => setArcadeSettings({
                  ...arcadeSettings,
                  expression: '',
                  template: '',
                  status: '',
                  lastApplied: null
                })}
              >
                Reset
              </button>
            </div>
          </div>
        );

      case 'spatial_analysis':
        return (
          <div className="tool-content" style={{ paddingBottom: '16px' }}>
            <p className="description" style={{ marginBottom: '20px', color: '#64748b', fontSize: '13px' }}>
              Perform advanced spatial operations to derive geographical insights.
            </p>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Select Analysis Tool</label>
              <select 
                className="tool-select"
                value={spatialSettings.subTool}
                onChange={(e) => setSpatialSettings({...spatialSettings, subTool: e.target.value})}
              >
                <option>Buffer Analysis</option>
                <option>Select by Location</option>
                <option>Overlay (Intersect)</option>
                <option>Proximity (Nearest)</option>
                <option>Heatmap Density</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Target Layer</label>
              <select 
                className="tool-select"
                value={spatialSettings.layerId}
                onChange={(e) => setSpatialSettings({...spatialSettings, layerId: e.target.value})}
              >
                {layersConfig.map(l => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </div>

            {spatialSettings.subTool === 'Buffer Analysis' && (
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 2 }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Distance</label>
                    <input 
                      type="number" 
                      className="tool-input" 
                      value={spatialSettings.bufferDistance}
                      onChange={(e) => setSpatialSettings({...spatialSettings, bufferDistance: Number(e.target.value)})}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Unit</label>
                    <select 
                      className="tool-select"
                      value={spatialSettings.bufferUnit}
                      onChange={(e) => setSpatialSettings({...spatialSettings, bufferUnit: e.target.value})}
                    >
                      <option value="meters">m</option>
                      <option value="kilometers">km</option>
                      <option value="miles">mi</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {spatialSettings.subTool === 'Proximity (Nearest)' && (
              <div style={{ marginBottom: '16px', padding: '12px', background: 'rgba(30, 60, 114, 0.05)', borderRadius: '8px', border: '1px dashed #1e3c72' }}>
                <span style={{ fontSize: '12px', color: '#1e3c72', fontWeight: '600' }}>Instructions:</span>
                <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#64748b' }}>Click any point on the map to find the nearest feature in the selected layer.</p>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: '20px' }}>
              <div className="arcade-guide" style={{ padding: '12px', background: 'rgba(30, 60, 114, 0.03)', borderRadius: '8px', border: '1px dashed rgba(30, 60, 114, 0.2)' }}>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#1e3c72', fontWeight: '700' }}>Tool Info:</h4>
                <p style={{ margin: 0, fontSize: '11px', color: '#64748b', lineHeight: '1.4' }}>
                  {spatialSettings.subTool === 'Buffer Analysis' && "Creates a polygon around map features at a specified distance."}
                  {spatialSettings.subTool === 'Select by Location' && "Filters features based on their spatial relationship with another layer."}
                  {spatialSettings.subTool === 'Overlay (Intersect)' && "Identifies areas where two layers geographically overlap."}
                  {spatialSettings.subTool === 'Proximity (Nearest)' && "Calculates the straight-line distance to the closest item."}
                  {spatialSettings.subTool === 'Heatmap Density' && "Visualizes the geographic concentration of features."}
                </p>
              </div>
            </div>

            {spatialSettings.status && (
              <div style={{ 
                marginBottom: '16px', 
                padding: '12px', 
                background: spatialSettings.status.includes('Click') ? 'rgba(30, 60, 114, 0.05)' : '#f0fdf4', 
                color: spatialSettings.status.includes('Click') ? '#1e3c72' : '#166534', 
                borderRadius: '8px', 
                fontSize: '12px', 
                fontWeight: '700', 
                textAlign: 'center', 
                border: '1px solid ' + (spatialSettings.status.includes('Click') ? '#1e3c72' : '#dcfce7') 
              }}>
                {spatialSettings.status.includes('Click') ? '📍 ' : '✔ '} {spatialSettings.status}
              </div>
            )}

            {spatialSettings.distanceResult && (
              <div style={{ marginBottom: '16px', padding: '15px', background: '#1e3c72', color: 'white', borderRadius: '12px', textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', opacity: 0.8, display: 'block', marginBottom: '4px' }}>Nearest Distance</span>
                <span style={{ fontSize: '24px', fontWeight: '800' }}>{spatialSettings.distanceResult}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="primary-btn" 
                style={{ flex: 1, padding: '10px', borderRadius: '10px', background: 'linear-gradient(135deg, #df261c, #002d5d)', color: 'white', fontWeight: '700', border: 'none', cursor: 'pointer' }}
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
              <button 
                className="secondary-btn"
                style={{ flex: 1, padding: '10px', borderRadius: '10px', background: '#f1f5f9', color: '#1a2f4d', fontWeight: '700', border: '1px solid #e2e8f0', cursor: 'pointer' }}
                onClick={() => setSpatialSettings({...spatialSettings, status: '', lastRun: null, distanceResult: null, isWaitingForClick: false})}
              >
                Clear
              </button>
            </div>
          </div>
        );

      case 'time_compare':
        return (
          <div className="tool-content" style={{ paddingBottom: '16px' }}>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Timeline Dataset</label>
              <select 
                className="tool-select"
                value={timelapseSettings.layerId}
                onChange={(e) => {
                  const val = e.target.value;
                  const isBlocks = val === 'blocks-bahrain';
                  setTimelapseSettings({
                    ...timelapseSettings, 
                    layerId: val,
                    mode: isBlocks ? 'range' : 'single',
                    startYear: isBlocks ? 2018 : 1940,
                    endYear: isBlocks ? 2024 : 2024,
                    fromYear: isBlocks ? 2018 : null,
                    toYear: isBlocks ? 2024 : null,
                    currentYear: isBlocks ? 2024 : 2024,
                    isPlaying: false
                  });
                }}
              >
                {layersConfig.filter(l => l.time !== undefined || l.timeEnabled).map(l => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '24px', padding: '20px', background: 'linear-gradient(135deg, #1e3c72, #2a5298)', borderRadius: '16px', color: 'white', textAlign: 'center', boxShadow: '0 8px 24px rgba(30, 60, 114, 0.2)' }}>
              <span style={{ fontSize: '12px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '1px' }}>Current Range</span>
              <div style={{ fontSize: '32px', fontWeight: '900', margin: '4px 0' }}>
                {timelapseSettings.mode === 'range' ? `${timelapseSettings.fromYear} – ${timelapseSettings.toYear}` : timelapseSettings.currentYear}
              </div>
              <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', position: 'relative', marginTop: '10px' }}>
                <div style={{ 
                  position: 'absolute', 
                  left: 0, 
                  height: '100%', 
                  background: '#facc15', 
                  borderRadius: '2px',
                  width: timelapseSettings.mode === 'range' 
                    ? `${((timelapseSettings.toYear - timelapseSettings.startYear) / (timelapseSettings.endYear - timelapseSettings.startYear)) * 100}%`
                    : `${((timelapseSettings.currentYear - timelapseSettings.startYear) / (timelapseSettings.endYear - timelapseSettings.startYear)) * 100}%`
                }}></div>
              </div>
            </div>

            {timelapseSettings.mode === 'range' ? (
              <div style={{ display: 'flex', gap: '15px', marginBottom: '24px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '12px' }}>From Year</label>
                  <select 
                    className="tool-select"
                    value={timelapseSettings.fromYear}
                    onChange={(e) => setTimelapseSettings({...timelapseSettings, fromYear: Number(e.target.value), isPlaying: false})}
                  >
                    {[2018, 2019, 2020, 2021, 2022, 2023, 2024].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '12px' }}>To Year</label>
                  <select 
                    className="tool-select"
                    value={timelapseSettings.toYear}
                    onChange={(e) => setTimelapseSettings({...timelapseSettings, toYear: Number(e.target.value), isPlaying: false})}
                  >
                    {[2018, 2019, 2020, 2021, 2022, 2023, 2024].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="form-group" style={{ marginBottom: '24px' }}>
                <input 
                  type="range" 
                  min={timelapseSettings.startYear} 
                  max={timelapseSettings.endYear} 
                  value={timelapseSettings.currentYear}
                  onChange={(e) => setTimelapseSettings({...timelapseSettings, currentYear: Number(e.target.value), isPlaying: false})}
                  style={{ width: '100%', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', color: '#64748b', fontWeight: '600' }}>
                  <span>{timelapseSettings.startYear}</span>
                  <span>{timelapseSettings.endYear}</span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginBottom: '24px' }}>
              <button 
                onClick={() => {
                  if (timelapseSettings.mode === 'range') {
                    setTimelapseSettings(prev => ({ ...prev, toYear: Math.max(prev.fromYear, prev.toYear - 1), isPlaying: false }));
                  } else {
                    setTimelapseSettings(prev => ({ ...prev, currentYear: Math.max(prev.startYear, prev.currentYear - 1), isPlaying: false }));
                  }
                }}
                style={{ background: '#f1f5f9', border: 'none', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e3c72' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 20L9 12L19 4V20Z" fill="currentColor"/><path d="M5 19V5" strokeWidth="3"/></svg>
              </button>
              
              <button 
                onClick={() => setTimelapseSettings(prev => ({ ...prev, isPlaying: !prev.isPlaying }))}
                style={{ background: 'linear-gradient(135deg, #df261c, #002d5d)', border: 'none', width: '60px', height: '60px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 4px 15px rgba(223, 38, 28, 0.3)' }}
              >
                {timelapseSettings.isPlaying ? (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                ) : (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5V19L19 12L8 5Z"/></svg>
                )}
              </button>

              <button 
                onClick={() => {
                  if (timelapseSettings.mode === 'range') {
                    setTimelapseSettings(prev => ({ ...prev, toYear: Math.min(prev.endYear, prev.toYear + 1), isPlaying: false }));
                  } else {
                    setTimelapseSettings(prev => ({ ...prev, currentYear: Math.min(prev.endYear, prev.currentYear + 1), isPlaying: false }));
                  }
                }}
                style={{ background: '#f1f5f9', border: 'none', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e3c72' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 4L15 12L5 20V4Z" fill="currentColor"/><path d="M19 5V19" strokeWidth="3"/></svg>
              </button>
            </div>

            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '12px' }}>Speed</label>
                <select 
                  className="tool-select"
                  style={{ height: '36px', fontSize: '12px' }}
                  value={timelapseSettings.speed}
                  onChange={(e) => setTimelapseSettings({...timelapseSettings, speed: e.target.value})}
                >
                  <option>Slow</option>
                  <option>Medium</option>
                  <option>Fast</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '12px' }}>Loop</label>
                <div 
                  onClick={() => setTimelapseSettings(prev => ({ ...prev, loop: !prev.loop }))}
                  style={{ 
                    height: '36px', 
                    background: timelapseSettings.loop ? '#f0fdf4' : '#f1f5f9',
                    border: `1px solid ${timelapseSettings.loop ? '#166534' : '#e2e8f0'}`,
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: timelapseSettings.loop ? '#166534' : '#64748b'
                  }}
                >
                  {timelapseSettings.loop ? 'Enabled' : 'Disabled'}
                </div>
              </div>
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
            <p className="description">{t('splitPanelDesc')}</p>
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
              <select className="tool-select" value={splitLayers.left} onChange={(e) => setSplitLayers(prev => ({ ...prev, left: e.target.value }))} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <optgroup label={t('splitLayerLabel')}>
                  {layersConfig.filter(l => !l.time).map(layer => (<option key={layer.id} value={layer.id}>{layer.title}</option>))}
                </optgroup>
                <optgroup label={t('splitTimeLabel')}>
                  {layersConfig.filter(l => l.time).map(layer => (<option key={layer.id} value={layer.id}>{layer.title}</option>))}
                </optgroup>
              </select>
            </div>
            <div className="form-group">
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d' }}>{t('splitRightLayer')}</label>
              <select className="tool-select" value={splitLayers.right} onChange={(e) => setSplitLayers(prev => ({ ...prev, right: e.target.value }))} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <optgroup label={t('splitLayerLabel')}>
                  {layersConfig.filter(l => !l.time).map(layer => (<option key={layer.id} value={layer.id}>{layer.title}</option>))}
                </optgroup>
                <optgroup label={t('splitTimeLabel')}>
                  {layersConfig.filter(l => l.time).map(layer => (<option key={layer.id} value={layer.id}>{layer.title}</option>))}
                </optgroup>
              </select>
            </div>
          </div>
        );

      case 'split_view':
        return (
          <div className="tool-content">
            <p className="description">View two maps side-by-side.</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'rgba(30, 60, 114, 0.05)', borderRadius: '8px', marginBottom: '20px', border: '1px solid rgba(30, 60, 114, 0.1)' }}>
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
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d' }}>Left Layer</label>
              <select className="tool-select" value={splitLayers.left} onChange={(e) => setSplitLayers(prev => ({ ...prev, left: e.target.value }))} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                {layersConfig.map(layer => (<option key={layer.id} value={layer.id}>{layer.title}</option>))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d' }}>Right Layer</label>
              <select className="tool-select" value={splitLayers.right} onChange={(e) => setSplitLayers(prev => ({ ...prev, right: e.target.value }))} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                {layersConfig.map(layer => (<option key={layer.id} value={layer.id}>{layer.title}</option>))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a2f4d', fontSize: '13px' }}>Extent Synchronization</label>
              <select className="tool-select" value={syncMode} onChange={(e) => setSyncMode(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.1)', background: 'white', fontSize: '13px', fontWeight: '500', color: '#1a2f4d', cursor: 'pointer' }}>
                <option value="both">Sync Both Views (pan + zoom)</option>
                <option value="zoom">Sync Zoom Only</option>
                <option value="none">Independent Views</option>
              </select>
            </div>
          </div>
        );

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
        return (
          <div className="tool-content">
            <div className="btn-group">
              <button className="tool-btn-item">{t('measureDistance')}</button>
              <button className="tool-btn-item">{t('measureArea')}</button>
            </div>
            <p className="hint">{t('measureHint')}</p>
          </div>
        );

      case 'draw':
        return (
          <div className="tool-content">
            <div className="draw-tools">
              <button className="draw-icon">{t('drawPoint')}</button>
              <button className="draw-icon">{t('drawLine')}</button>
              <button className="draw-icon">{t('drawPolygon')}</button>
            </div>
          </div>
        );

      case 'print':
        return (
          <div className="tool-content">
            <div className="form-group">
              <label>{t('printFormat')}</label>
              <select className="tool-select">
                <option>PDF</option>
                <option>PNG</option>
                <option>JPG</option>
              </select>
            </div>
            <button className="primary-btn full-width">{t('printExportBtn')}</button>
          </div>
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
          basemap={currentBasemap}
          swipeMode={swipeMode}
          onSwipePositionChange={setSwipeInfo}
        />
      </div>
      
      <DualMapView 
        isSplitView={isSplitView} 
        splitLayers={splitLayers} 
        basemap={currentBasemap} 
        syncMode={syncMode}
        onExit={() => setIsSplitView(false)}
      />
      <MapControls 
        view={mapView} 
        activeTool={activeTool} 
        onToolSelect={setActiveTool} 
        is3D={is3D} 
        onToggle3D={() => setIs3D(!is3D)} 
        is3DDisabled={is3DDisabled}
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
