import React, { useState, useEffect, useRef } from 'react';
import { 
  MousePointer2, 
  MapPin, 
  Share2, 
  Trash2, 
  Layers, 
  Type, 
  Circle as CircleIcon, 
  Square, 
  Hexagon,
  Download,
  Upload,
  Settings,
  PenTool,
  Maximize2,
  Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import SketchViewModel from '@arcgis/core/widgets/Sketch/SketchViewModel';
import { useLanguage } from '../context/LanguageContext';
import './DrawPanel.css';

const DRAW_TOOLS = [
  { id: 'point', icon: MapPin, label: 'Point', tKey: 'drawToolPoint' },
  { id: 'polyline', icon: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l6 6l6-6l6 6" />
    </svg>
  ), label: 'Polyline', tKey: 'drawToolPolyline' },
  { id: 'polygon', icon: Hexagon, label: 'Polygon', tKey: 'drawToolPolygon' },
  { id: 'circle', icon: CircleIcon, label: 'Circle', tKey: 'drawToolCircle' },
  { id: 'rectangle', icon: Square, label: 'Rectangle', tKey: 'drawToolRectangle' },
  { id: 'text', icon: Type, label: 'Text', tKey: 'drawToolText' },
];

const DrawPanel = ({ view }) => {
  const { t, lang } = useLanguage();
  const isRTL = lang === 'AR';

  const [activeTab, setActiveTab] = useState('draw'); // 'draw', 'styles'
  const [drawStep, setDrawStep] = useState('tools'); // 'tools', 'config'
  const [drawings, setDrawings] = useState([]);
  const [activeDrawTool, setActiveDrawTool] = useState(null);
  const [isHidden, setIsHidden] = useState(false);
  
  // Style State
  const [selectedGraphic, setSelectedGraphic] = useState(null);
  const [styleConfig, setStyleConfig] = useState({
    name: 'My Drawing',
    description: '',
    size: 12,
    color: '#df261c',
    opacity: 0.15,
    outlineColor: '#df261c',
    outlineWidth: 2,
    units: 'pixel',
    snapping: true,
    snappingTooltips: true,
    type: 'point',
    markerStyle: 'circle',
    lineStyle: 'solid',
    fillStyle: 'solid',
    outlineStyle: 'solid'
  });

  const graphicsLayerRef = useRef(null);
  const sketchVMRef = useRef(null);

  // Initialize Layer and SketchVM
  useEffect(() => {
    if (!view) return;

    const layer = new GraphicsLayer({
      title: "BSDI Drawings",
      id: "bsdi_drawings_layer"
    });
    view.map.add(layer);
    graphicsLayerRef.current = layer;

    const svm = new SketchViewModel({
      view: view,
      layer: layer,
      updateOnGraphicClick: true,
      defaultUpdateOptions: {
        enableRotation: true,
        enableScaling: true,
        preserveAspectRatio: false,
        toggleToolOnClick: false
      },
      snappingOptions: {
        enabled: styleConfig.snapping,
        featureSources: [{ layer: layer }]
      },
      pointSymbol: {
        type: "simple-marker",
        style: "circle",
        color: [223, 38, 28, 0.8],
        size: "12px",
        outline: { color: [255, 255, 255], width: 2 }
      },
      polylineSymbol: {
        type: "simple-line",
        color: [223, 38, 28, 1],
        width: "2px",
        style: "solid"
      },
      polygonSymbol: {
        type: "simple-fill",
        color: [223, 38, 28, 0.15],
        outline: { color: [223, 38, 28, 1], width: 2, style: "solid" }
      }
    });

    svm.on("create", (event) => {
      if (event.state === "complete") {
        const graphic = event.graphic;
        
        // Apply current styles
        applyStyleToGraphic(graphic, { ...styleConfig, type: activeDrawTool });
        
        const newDrawing = {
          id: crypto.randomUUID(),
          title: styleConfig.name,
          type: activeDrawTool,
          graphic: graphic,
          timestamp: new Date().toISOString(),
          style: { ...styleConfig, type: activeDrawTool }
        };
        
        setDrawings(prev => [newDrawing, ...prev]);
        setActiveDrawTool(null);
        setSelectedGraphic(graphic);
        setDrawStep('config');
      }
    });

    svm.on("update", (event) => {
      if (event.state === "start" || event.state === "active") {
        const graphic = event.graphics[0];
        setSelectedGraphic(graphic);
        // Find existing drawing and load its styles
        setDrawings(prev => {
          const drawing = prev.find(d => d.graphic === graphic);
          if (drawing) {
            setStyleConfig(drawing.style);
            setDrawStep('config');
            setActiveTab('draw');
          }
          return prev;
        });
      }
    });

    sketchVMRef.current = svm;

    return () => {
      console.log("Cleanup: DrawPanel");
      if (svm) svm.destroy();
      if (view && view.map) {
        view.map.remove(layer);
      }
    };
  }, [view]);

  // Sync snapping
  useEffect(() => {
    if (sketchVMRef.current) {
      sketchVMRef.current.snappingOptions.enabled = styleConfig.snapping;
    }
  }, [styleConfig.snapping]);

  // Sync visibility
  useEffect(() => {
    if (graphicsLayerRef.current) {
      graphicsLayerRef.current.visible = !isHidden;
    }
  }, [isHidden]);

  const applyStyleToGraphic = (graphic, style) => {
    const type = graphic.geometry.type;
    const colorArr = hexToRgb(style.color, style.opacity);
    const outlineColorArr = hexToRgb(style.outlineColor, 1);
    const lineColorArr = hexToRgb(style.color, style.opacity);

    if (type === 'point') {
      if (style.type === 'text') {
        graphic.symbol = {
          type: "text",
          color: style.color,
          text: style.name || "Text Label",
          font: {
            size: style.size,
            family: "Inter",
            weight: "bold"
          },
          haloColor: style.outlineColor,
          haloSize: style.outlineWidth
        };
      } else {
        graphic.symbol = {
          type: "simple-marker",
          style: style.markerStyle || "circle",
          color: colorArr,
          size: `${style.size}px`,
          outline: {
            color: outlineColorArr,
            width: style.outlineWidth,
            style: style.outlineStyle || "solid"
          }
        };
      }
    } else if (type === 'polyline') {
      graphic.symbol = {
        type: "simple-line",
        color: lineColorArr,
        width: style.outlineWidth,
        style: style.lineStyle || "solid"
      };
    } else if (type === 'polygon' || type === 'extent' || type === 'circle') {
      graphic.symbol = {
        type: "simple-fill",
        color: colorArr,
        style: style.fillStyle || "solid",
        outline: {
          color: outlineColorArr,
          width: style.outlineWidth,
          style: style.outlineStyle || "solid"
        }
      };
    }
  };

  const hexToRgb = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b, alpha];
  };

  const handleToolSelect = (toolId) => {
    if (!sketchVMRef.current) return;
    
    if (activeDrawTool === toolId) {
      sketchVMRef.current.cancel();
      setActiveDrawTool(null);
    } else {
      setActiveDrawTool(toolId);
      let arcgisTool = toolId;
      if (toolId === 'polyline-freehand') arcgisTool = 'polyline';
      if (toolId === 'text') arcgisTool = 'point';
      
      sketchVMRef.current.create(arcgisTool, {
        mode: (toolId === 'polygon' || toolId === 'polyline' || toolId === 'text' || toolId === 'point') ? 'click' : 'hybrid'
      });
    }
  };

  const handleUpdateStyle = (updates) => {
    const newStyle = { ...styleConfig, ...updates };
    setStyleConfig(newStyle);
    
    if (selectedGraphic) {
      applyStyleToGraphic(selectedGraphic, newStyle);
      setDrawings(prev => prev.map(d => 
        d.graphic === selectedGraphic 
          ? { ...d, title: newStyle.name, style: newStyle } 
          : d
      ));
    }
  };

  const zoomToDrawing = (graphic) => {
    if (view && graphic.geometry) {
      view.goTo(graphic.geometry.extent ? graphic.geometry.extent.expand(1.5) : { target: graphic.geometry, zoom: 15 });
    }
  };

  const deleteDrawing = (id) => {
    const drawing = drawings.find(d => d.id === id);
    if (drawing) {
      graphicsLayerRef.current.remove(drawing.graphic);
      setDrawings(prev => prev.filter(d => d.id !== id));
      if (selectedGraphic === drawing.graphic) {
        setSelectedGraphic(null);
        setDrawStep('tools');
        sketchVMRef.current.cancel();
      }
    }
  };

  const duplicateDrawing = (id) => {
    const original = drawings.find(d => d.id === id);
    if (original) {
      const clone = original.graphic.clone();
      graphicsLayerRef.current.add(clone);
      const newDrawing = {
        ...original,
        id: crypto.randomUUID(),
        graphic: clone,
        title: `${original.title} (Copy)`,
        timestamp: new Date().toISOString()
      };
      setDrawings(prev => [newDrawing, ...prev]);
    }
  };

  const exportDrawings = () => {
    if (drawings.length === 0) return;
    const data = drawings.map(d => ({
      title: d.title,
      type: d.type,
      geometry: d.graphic.geometry.toJSON(),
      style: d.style
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BSDI_Drawings_${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`draw-panel-wrapper ${isRTL ? 'rtl' : ''}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="draw-tabs">
        <button 
          className={`draw-tab ${activeTab === 'draw' ? 'active' : ''}`}
          onClick={() => setActiveTab('draw')}
        >
          <PenTool size={16} /> {t('drawTabTitle')}
        </button>
        <button 
          className={`draw-tab ${activeTab === 'styles' ? 'active' : ''}`}
          onClick={() => setActiveTab('styles')}
        >
          <Settings size={16} /> {t('drawingsListTabTitle')}
        </button>
      </div>

      <div className="draw-content-scroll">
        <AnimatePresence mode="wait">
          {activeTab === 'draw' ? (
            <motion.div 
              key={drawStep}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="draw-content-container"
            >
              {drawStep === 'tools' ? (
                <div className="draw-tool-grid">
                  {DRAW_TOOLS.map((tool) => {
                    const Icon = tool.icon;
                    return (
                      <button 
                        key={tool.id}
                        className={`draw-tool-btn ${activeDrawTool === tool.id ? 'active' : ''}`}
                        onClick={() => handleToolSelect(tool.id)}
                      >
                        <Icon size={24} />
                        <span>{t(tool.tKey)}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="style-config-container">
                  <div className="config-section">
                    <div className="form-group">
                      <label>{t('drawNameLabel')}</label>
                      <input 
                        type="text" 
                        className="tool-input"
                        placeholder={t('drawNamePlaceholder')}
                        value={styleConfig.name}
                        onChange={(e) => handleUpdateStyle({ name: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>{t('drawDescriptionLabel')}</label>
                      <textarea 
                        className="tool-textarea"
                        placeholder={t('drawDescriptionPlaceholder')}
                        value={styleConfig.description}
                        onChange={(e) => handleUpdateStyle({ description: e.target.value })}
                      />
                    </div>
                    <div className="form-row">
                      <label className="checkbox-label">
                        <input type="checkbox" checked={styleConfig.snapping} onChange={(e) => handleUpdateStyle({ snapping: e.target.checked })} />
                        {t('drawSnappingLabel')}
                      </label>
                      <label className="checkbox-label">
                        <input type="checkbox" checked={styleConfig.snappingTooltips} onChange={(e) => handleUpdateStyle({ snappingTooltips: e.target.checked })} />
                        {t('drawSnappingTooltipLabel')}
                      </label>
                    </div>
                  </div>

                  <div className="config-section">
                    <span className="section-title">{t('drawSymbolStyleSection')}</span>
                    <div className="symbol-preview-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '12px' }}>
                      <span className="preview-label" style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', marginBottom: '6px' }}>{t('drawLivePreviewLabel')}</span>
                      {(() => {
                        const type = styleConfig.type;
                        if (type === 'polyline' || type === 'polyline-freehand') {
                          let strokeDasharray = "none";
                          if (styleConfig.lineStyle === 'dash') strokeDasharray = "6,4";
                          else if (styleConfig.lineStyle === 'dot') strokeDasharray = "2,3";
                          else if (styleConfig.lineStyle === 'dash-dot') strokeDasharray = "8,4,2,4";
                          
                          return (
                            <svg width="100%" height="24" style={{ display: 'block' }}>
                              <line 
                                x1="0" 
                                y1="12" 
                                x2="100%" 
                                y2="12" 
                                stroke={styleConfig.color} 
                                strokeWidth={styleConfig.outlineWidth} 
                                strokeDasharray={strokeDasharray}
                                opacity={styleConfig.opacity}
                              />
                            </svg>
                          );
                        }
                        if (type === 'text') {
                          return <span style={{ color: styleConfig.color, fontSize: `${styleConfig.size}px`, fontWeight: 'bold', textShadow: `0 0 ${styleConfig.outlineWidth}px ${styleConfig.outlineColor}` }}>{styleConfig.name || 'Text'}</span>;
                        }
                        if (type === 'polygon' || type === 'circle' || type === 'rectangle') {
                          let outlineDasharray = "none";
                          if (styleConfig.outlineStyle === 'dash') outlineDasharray = "6,4";
                          else if (styleConfig.outlineStyle === 'dot') outlineDasharray = "2,3";
                          else if (styleConfig.outlineStyle === 'dash-dot') outlineDasharray = "8,4,2,4";

                          return (
                            <svg width="60" height="40" style={{ display: 'block', margin: 'auto' }}>
                              <rect 
                                x="5" 
                                y="5" 
                                width="50" 
                                height="30" 
                                fill={styleConfig.color} 
                                fillOpacity={styleConfig.opacity}
                                stroke={styleConfig.outlineColor} 
                                strokeWidth={styleConfig.outlineWidth} 
                                strokeDasharray={outlineDasharray}
                                rx={type === 'circle' ? '15' : '4'}
                                ry={type === 'circle' ? '15' : '4'}
                              />
                            </svg>
                          );
                        }
                        if (type === 'point') {
                          let outlineDasharray = "none";
                          if (styleConfig.outlineStyle === 'dash') outlineDasharray = "3,2";
                          else if (styleConfig.outlineStyle === 'dot') outlineDasharray = "1,1";
                          
                          if (styleConfig.markerStyle === 'circle') {
                            return (
                              <svg width="40" height="40" style={{ display: 'block', margin: 'auto' }}>
                                <circle 
                                  cx="20" 
                                  cy="20" 
                                  r={Math.min(18, styleConfig.size / 2)} 
                                  fill={styleConfig.color} 
                                  fillOpacity={styleConfig.opacity}
                                  stroke={styleConfig.outlineColor} 
                                  strokeWidth={styleConfig.outlineWidth}
                                  strokeDasharray={outlineDasharray}
                                />
                              </svg>
                            );
                          } else if (styleConfig.markerStyle === 'square') {
                            const side = Math.min(36, styleConfig.size);
                            const offset = 20 - side / 2;
                            return (
                              <svg width="40" height="40" style={{ display: 'block', margin: 'auto' }}>
                                <rect 
                                  x={offset} 
                                  y={offset} 
                                  width={side} 
                                  height={side} 
                                  fill={styleConfig.color} 
                                  fillOpacity={styleConfig.opacity}
                                  stroke={styleConfig.outlineColor} 
                                  strokeWidth={styleConfig.outlineWidth}
                                  strokeDasharray={outlineDasharray}
                                />
                              </svg>
                            );
                          } else if (styleConfig.markerStyle === 'triangle') {
                            const side = Math.min(36, styleConfig.size);
                            const p1 = "20," + (20 - side/2);
                            const p2 = (20 - side/2) + "," + (20 + side/2);
                            const p3 = (20 + side/2) + "," + (20 + side/2);
                            return (
                              <svg width="40" height="40" style={{ display: 'block', margin: 'auto' }}>
                                <polygon 
                                  points={`${p1} ${p2} ${p3}`}
                                  fill={styleConfig.color} 
                                  fillOpacity={styleConfig.opacity}
                                  stroke={styleConfig.outlineColor} 
                                  strokeWidth={styleConfig.outlineWidth}
                                  strokeDasharray={outlineDasharray}
                                />
                              </svg>
                            );
                          } else {
                            // diamond
                            const side = Math.min(36, styleConfig.size);
                            const p1 = "20," + (20 - side/2);
                            const p2 = (20 + side/2) + ",20";
                            const p3 = "20," + (20 + side/2);
                            const p4 = (20 - side/2) + ",20";
                            return (
                              <svg width="40" height="40" style={{ display: 'block', margin: 'auto' }}>
                                <polygon 
                                  points={`${p1} ${p2} ${p3} ${p4}`}
                                  fill={styleConfig.color} 
                                  fillOpacity={styleConfig.opacity}
                                  stroke={styleConfig.outlineColor} 
                                  strokeWidth={styleConfig.outlineWidth}
                                  strokeDasharray={outlineDasharray}
                                />
                              </svg>
                            );
                          }
                        }
                        return null;
                      })()}
                    </div>

                    <div className="style-properties">
                      {/* Point Type Controls */}
                      {styleConfig.type === 'point' && (
                        <>
                          <div className="form-row">
                            <div className="property-group">
                              <label>{t('drawMarkerShapeLabel')}</label>
                              <select 
                                className="tool-select" 
                                value={styleConfig.markerStyle || 'circle'} 
                                onChange={(e) => handleUpdateStyle({ markerStyle: e.target.value })}
                              >
                                <option value="circle">{t('drawMarkerShapeCircle')}</option>
                                <option value="square">{t('drawMarkerShapeSquare')}</option>
                                <option value="triangle">{t('drawMarkerShapeTriangle')}</option>
                                <option value="diamond">{t('drawMarkerShapeDiamond')}</option>
                              </select>
                            </div>
                            <div className="property-group">
                              <label>{t('drawMarkerSizeLabel')}</label>
                              <input 
                                type="number" 
                                className="tool-input" 
                                value={styleConfig.size} 
                                onChange={(e) => handleUpdateStyle({ size: Number(e.target.value) })} 
                              />
                            </div>
                          </div>

                          <div className="form-row">
                            <div className="property-group">
                              <label>{t('drawFillColorLabel')}</label>
                              <input 
                                type="color" 
                                className="color-input" 
                                style={{ width: '100%', height: '40px' }} 
                                value={styleConfig.color} 
                                onChange={(e) => handleUpdateStyle({ color: e.target.value })} 
                              />
                            </div>
                            <div className="property-group">
                              <label>{t('drawTransparencyLabel')}</label>
                              <div className="property-control" style={{ height: '40px' }}>
                                <input 
                                  type="range" 
                                  className="slider-control" 
                                  min="0" 
                                  max="1" 
                                  step="0.01" 
                                  value={styleConfig.opacity} 
                                  onChange={(e) => handleUpdateStyle({ opacity: Number(e.target.value) })} 
                                />
                                <span style={{ fontSize: '11px' }}>{Math.round(styleConfig.opacity * 100)}%</span>
                              </div>
                            </div>
                          </div>

                          <div className="form-row">
                            <div className="property-group">
                              <label>{t('drawOutlineColorLabel')}</label>
                              <input 
                                type="color" 
                                className="color-input" 
                                style={{ width: '100%', height: '40px' }} 
                                value={styleConfig.outlineColor} 
                                onChange={(e) => handleUpdateStyle({ outlineColor: e.target.value })} 
                              />
                            </div>
                            <div className="property-group">
                              <label>{t('drawOutlineWidthLabel')}</label>
                              <input 
                                type="number" 
                                className="tool-input" 
                                value={styleConfig.outlineWidth} 
                                onChange={(e) => handleUpdateStyle({ outlineWidth: Number(e.target.value) })} 
                              />
                            </div>
                          </div>
                        </>
                      )}

                      {/* Polyline / Line Controls */}
                      {(styleConfig.type === 'polyline' || styleConfig.type === 'polyline-freehand') && (
                        <>
                          <div className="form-row">
                            <div className="property-group">
                              <label>{t('drawLineStyleLabel')}</label>
                              <select 
                                className="tool-select" 
                                value={styleConfig.lineStyle || 'solid'} 
                                onChange={(e) => handleUpdateStyle({ lineStyle: e.target.value })}
                              >
                                <option value="solid">{t('drawStyleSolid')}</option>
                                <option value="dash">{t('drawStyleDashed')}</option>
                                <option value="dot">{t('drawStyleDotted')}</option>
                                <option value="dash-dot">{t('drawStyleDashDot')}</option>
                              </select>
                            </div>
                            <div className="property-group">
                              <label>{t('drawOutlineWidthLabel')}</label>
                              <input 
                                type="number" 
                                className="tool-input" 
                                value={styleConfig.outlineWidth} 
                                onChange={(e) => handleUpdateStyle({ outlineWidth: Number(e.target.value) })} 
                              />
                            </div>
                          </div>

                          <div className="form-row">
                            <div className="property-group">
                              <label>{t('drawLineColorLabel')}</label>
                              <input 
                                type="color" 
                                className="color-input" 
                                style={{ width: '100%', height: '40px' }} 
                                value={styleConfig.color} 
                                onChange={(e) => handleUpdateStyle({ color: e.target.value })} 
                              />
                            </div>
                            <div className="property-group">
                              <label>{t('drawTransparencyLabel')}</label>
                              <div className="property-control" style={{ height: '40px' }}>
                                <input 
                                  type="range" 
                                  className="slider-control" 
                                  min="0" 
                                  max="1" 
                                  step="0.01" 
                                  value={styleConfig.opacity} 
                                  onChange={(e) => handleUpdateStyle({ opacity: Number(e.target.value) })} 
                                />
                                <span style={{ fontSize: '11px' }}>{Math.round(styleConfig.opacity * 100)}%</span>
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      {/* Polygon / Circle / Rectangle Controls */}
                      {(styleConfig.type === 'polygon' || styleConfig.type === 'circle' || styleConfig.type === 'rectangle') && (
                        <>
                          <div className="form-row">
                            <div className="property-group">
                              <label>{t('drawFillColorLabel')}</label>
                              <input 
                                type="color" 
                                className="color-input" 
                                style={{ width: '100%', height: '40px' }} 
                                value={styleConfig.color} 
                                onChange={(e) => handleUpdateStyle({ color: e.target.value })} 
                              />
                            </div>
                            <div className="property-group">
                              <label>{t('drawFillTransparencyLabel')}</label>
                              <div className="property-control" style={{ height: '40px' }}>
                                <input 
                                  type="range" 
                                  className="slider-control" 
                                  min="0" 
                                  max="1" 
                                  step="0.01" 
                                  value={styleConfig.opacity} 
                                  onChange={(e) => handleUpdateStyle({ opacity: Number(e.target.value) })} 
                                />
                                <span style={{ fontSize: '11px' }}>{Math.round(styleConfig.opacity * 100)}%</span>
                              </div>
                            </div>
                          </div>

                          <div className="form-row">
                            <div className="property-group">
                              <label>{t('drawOutlineStyleLabel')}</label>
                              <select 
                                className="tool-select" 
                                value={styleConfig.outlineStyle || 'solid'} 
                                onChange={(e) => handleUpdateStyle({ outlineStyle: e.target.value })}
                              >
                                <option value="solid">{t('drawStyleSolid')}</option>
                                <option value="dash">{t('drawStyleDashed')}</option>
                                <option value="dot">{t('drawStyleDotted')}</option>
                                <option value="dash-dot">{t('drawStyleDashDot')}</option>
                              </select>
                            </div>
                            <div className="property-group">
                              <label>{t('drawOutlineWidthLabel')}</label>
                              <input 
                                type="number" 
                                className="tool-input" 
                                value={styleConfig.outlineWidth} 
                                onChange={(e) => handleUpdateStyle({ outlineWidth: Number(e.target.value) })} 
                              />
                            </div>
                          </div>

                          <div className="form-row">
                            <div className="property-group">
                              <label>{t('drawOutlineColorLabel')}</label>
                              <input 
                                type="color" 
                                className="color-input" 
                                style={{ width: '100%', height: '40px' }} 
                                value={styleConfig.outlineColor} 
                                onChange={(e) => handleUpdateStyle({ outlineColor: e.target.value })} 
                              />
                            </div>
                          </div>
                        </>
                      )}

                      {/* Text Controls */}
                      {styleConfig.type === 'text' && (
                        <>
                          <div className="form-row">
                            <div className="property-group">
                              <label>{t('drawFontSizeLabel')}</label>
                              <input 
                                type="number" 
                                className="tool-input" 
                                value={styleConfig.size} 
                                onChange={(e) => handleUpdateStyle({ size: Number(e.target.value) })} 
                              />
                            </div>
                            <div className="property-group">
                              <label>{t('drawLabelColorLabel')}</label>
                              <input 
                                type="color" 
                                className="color-input" 
                                style={{ width: '100%', height: '40px' }} 
                                value={styleConfig.color} 
                                onChange={(e) => handleUpdateStyle({ color: e.target.value })} 
                              />
                            </div>
                          </div>

                          <div className="form-row">
                            <div className="property-group">
                              <label>{t('drawHaloColorLabel')}</label>
                              <input 
                                type="color" 
                                className="color-input" 
                                style={{ width: '100%', height: '40px' }} 
                                value={styleConfig.outlineColor} 
                                onChange={(e) => handleUpdateStyle({ outlineColor: e.target.value })} 
                              />
                            </div>
                            <div className="property-group">
                              <label>{t('drawHaloSizeLabel')}</label>
                              <input 
                                type="number" 
                                className="tool-input" 
                                value={styleConfig.outlineWidth} 
                                onChange={(e) => handleUpdateStyle({ outlineWidth: Number(e.target.value) })} 
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div 
              key="styles"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="drawings-management"
            >
              <div className="config-section">
                <div className="drawings-table-container">
                  <table className="drawings-table">
                    <thead>
                      <tr>
                        <th>{t('drawTableColName')}</th>
                        <th>{t('drawTableColStyle')}</th>
                        <th>{t('drawTableColActions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drawings.map(d => (
                        <tr key={d.id} className="drawing-row">
                          <td>{d.title}</td>
                          <td>
                            <div className="symbol-micro-preview">
                              {(() => {
                                const style = d.style;
                                const type = d.type;
                                if (type === 'polyline' || type === 'polyline-freehand') {
                                  return <div style={{ width: '16px', height: '0px', borderTop: `2px dashed ${style.color}` }} />;
                                }
                                if (type === 'text') {
                                  return <span style={{ color: style.color, fontSize: '10px', fontWeight: 'bold' }}>T</span>;
                                }
                                return <div style={{ width: '12px', height: '12px', backgroundColor: style.color, opacity: 0.8, border: `1px solid ${style.outlineColor}`, borderRadius: type === 'point' ? '50%' : '2px' }} />;
                              })()}
                            </div>
                          </td>
                          <td className="drawing-actions-cell">
                            <button className="row-action-btn" onClick={() => { setSelectedGraphic(d.graphic); setStyleConfig(d.style); setDrawStep('config'); setActiveTab('draw'); }} title={t('drawActionEdit')}><PenTool size={14} /></button>
                            <button className="row-action-btn" onClick={() => zoomToDrawing(d.graphic)} title={t('drawActionZoom')}><Maximize2 size={14} /></button>
                            <button className="row-action-btn" onClick={() => duplicateDrawing(d.id)} title={t('drawActionDuplicate')}><Copy size={14} /></button>
                            <button className="row-action-btn delete" onClick={() => deleteDrawing(d.id)} title={t('drawActionDelete')}><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      ))}
                      {drawings.length === 0 && (
                        <tr>
                          <td colSpan="3" style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>
                            {t('drawNoDrawingsYet')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Persistent Footer Actions */}
      <div className="draw-panel-footer">
        {activeTab === 'draw' && drawStep === 'config' && (
          <div className="draw-footer-actions">
            <button className="secondary-btn" onClick={() => { setDrawStep('tools'); setSelectedGraphic(null); }} style={{ padding: '8px 24px' }}>{t('drawBtnCancel')}</button>
            <button className="primary-btn" onClick={() => { setDrawStep('tools'); setSelectedGraphic(null); }} style={{ padding: '8px 24px', background: 'linear-gradient(135deg, #df261c, #002d5d)', color: 'white', border: 'none' }}>{t('drawBtnSave')}</button>
          </div>
        )}
        {activeTab === 'styles' && (
          <div className="draw-footer-actions">
            <button className="secondary-btn" style={{ color: '#dc2626', backgroundColor: '#fef2f2', borderColor: '#fecaca' }} onClick={() => { if(window.confirm(t('drawClearConfirm'))) { drawings.forEach(d => graphicsLayerRef.current.remove(d.graphic)); setDrawings([]); } }}><Trash2 size={16} /> {t('drawBtnClear')}</button>
            <button className="primary-btn" onClick={exportDrawings}><Download size={16} /> {t('drawBtnExport')}</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DrawPanel;
