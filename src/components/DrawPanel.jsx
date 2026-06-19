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
import CustomSelect from './CustomSelect';
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
    outlineStyle: 'solid',
    fontFamily: 'Inter',
    fontWeight: 'normal',
    fontStyle: 'normal',
    backgroundColor: 'transparent'
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

  // Sync SketchViewModel symbols with styleConfig
  useEffect(() => {
    if (!sketchVMRef.current) return;
    
    const pointSym = getSymbolForStyle(styleConfig, 'point');
    const textSym = getSymbolForStyle(styleConfig, 'text');
    const polylineSym = getSymbolForStyle(styleConfig, 'polyline');
    const polygonSym = getSymbolForStyle(styleConfig, 'polygon');
    
    if (activeDrawTool === 'text') {
      sketchVMRef.current.pointSymbol = textSym;
    } else {
      sketchVMRef.current.pointSymbol = pointSym;
    }
    
    sketchVMRef.current.polylineSymbol = polylineSym;
    sketchVMRef.current.polygonSymbol = polygonSym;
  }, [styleConfig, activeDrawTool]);

  // Sync visibility
  useEffect(() => {
    if (graphicsLayerRef.current) {
      graphicsLayerRef.current.visible = !isHidden;
    }
  }, [isHidden]);

  const PIN_PATH = "M20,4 C14,4 9,9 9,15 C9,23.5 20,36 20,36 C20,36 31,23.5 31,15 C31,9 26,4 20,4 Z M20,19 C17.8,19 16,17.2 16,15 C16,12.8 17.8,11 20,11 C22.2,11 24,12.8 24,15 C24,17.2 22.2,19 20,19 Z";
  const STAR_PATH = "M20,4 L24.5,13.5 L35,15 L27.5,22.5 L29.3,33 L20,28 L10.7,33 L12.5,22.5 L5,15 L15.5,13.5 Z";

  const getSymbolForStyle = (style, toolType) => {
    const markerStyle = style.markerStyle || 'circle';
    const sizeVal = style.size || 12;
    const colorArr = hexToRgb(style.color || '#df261c', style.opacity !== undefined ? style.opacity : 0.8);
    const outlineColorArr = hexToRgb(style.outlineColor || '#df261c', 1);
    const outlineWidthVal = style.outlineWidth !== undefined ? style.outlineWidth : 2;
    const outlineStyleVal = style.outlineStyle || 'solid';

    if (toolType === 'point') {
      let symStyle = markerStyle;
      let pathString = undefined;
      if (markerStyle === 'pin') {
        symStyle = 'path';
        pathString = PIN_PATH;
      } else if (markerStyle === 'star') {
        symStyle = 'path';
        pathString = STAR_PATH;
      }

      return {
        type: "simple-marker",
        style: symStyle,
        path: pathString,
        color: colorArr,
        size: `${sizeVal}px`,
        outline: {
          color: outlineColorArr,
          width: outlineWidthVal,
          style: outlineStyleVal
        }
      };
    } else if (toolType === 'text') {
      return {
        type: "text",
        color: style.color || '#df261c',
        text: style.name || "Text Label",
        font: {
          size: `${sizeVal}px`,
          family: style.fontFamily || "Inter",
          weight: style.fontWeight || "normal",
          style: style.fontStyle || "normal"
        },
        haloColor: style.outlineColor || '#ffffff',
        haloSize: outlineWidthVal || 0,
        backgroundColor: style.backgroundColor || 'transparent'
      };
    } else if (toolType === 'polyline' || toolType === 'polyline-freehand') {
      return {
        type: "simple-line",
        color: colorArr,
        width: outlineWidthVal,
        style: style.lineStyle || "solid"
      };
    } else if (toolType === 'polygon' || toolType === 'circle' || toolType === 'rectangle') {
      return {
        type: "simple-fill",
        color: colorArr,
        style: style.fillStyle || "solid",
        outline: {
          color: outlineColorArr,
          width: outlineWidthVal,
          style: outlineStyleVal
        }
      };
    }
    return null;
  };

  const applyStyleToGraphic = (graphic, style) => {
    const geomType = graphic.geometry.type;
    let toolType = geomType;
    if (geomType === 'point' && style.type === 'text') {
      toolType = 'text';
    }
    const symbol = getSymbolForStyle(style, toolType);
    if (symbol) {
      graphic.symbol = symbol;
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
      
      // Set dynamic style type for style panels
      setStyleConfig(prev => ({ ...prev, type: toolId }));
      setDrawStep('config');
      setSelectedGraphic(null);
      
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
                          const textBg = styleConfig.backgroundColor === 'transparent' ? 'transparent' : styleConfig.backgroundColor;
                          const textWeight = styleConfig.fontWeight || 'normal';
                          const textStyle = styleConfig.fontStyle || 'normal';
                          return (
                            <span style={{ 
                              color: styleConfig.color, 
                              fontSize: `${Math.min(24, styleConfig.size)}px`, 
                              fontFamily: styleConfig.fontFamily || 'Inter',
                              fontWeight: textWeight, 
                              fontStyle: textStyle,
                              backgroundColor: textBg,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              textShadow: styleConfig.outlineWidth > 0 ? `0 0 ${styleConfig.outlineWidth}px ${styleConfig.outlineColor}` : 'none'
                            }}>
                              {styleConfig.name || 'Text'}
                            </span>
                          );
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
                          } else if (styleConfig.markerStyle === 'diamond') {
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
                          } else if (styleConfig.markerStyle === 'cross') {
                            return (
                              <svg width="40" height="40" style={{ display: 'block', margin: 'auto' }}>
                                <path 
                                  d="M20,6 L20,34 M6,20 L34,20" 
                                  stroke={styleConfig.outlineColor} 
                                  strokeWidth={styleConfig.outlineWidth}
                                  strokeDasharray={outlineDasharray}
                                />
                              </svg>
                            );
                          } else if (styleConfig.markerStyle === 'x') {
                            return (
                              <svg width="40" height="40" style={{ display: 'block', margin: 'auto' }}>
                                <path 
                                  d="M8,8 L32,32 M32,8 L8,32" 
                                  stroke={styleConfig.outlineColor} 
                                  strokeWidth={styleConfig.outlineWidth}
                                  strokeDasharray={outlineDasharray}
                                />
                              </svg>
                            );
                          } else if (styleConfig.markerStyle === 'pin') {
                            return (
                              <svg width="40" height="40" viewBox="0 0 40 40" style={{ display: 'block', margin: 'auto' }}>
                                <path 
                                  d="M20,4 C14,4 9,9 9,15 C9,23.5 20,36 20,36 C20,36 31,23.5 31,15 C31,9 26,4 20,4 Z M20,19 C17.8,19 16,17.2 16,15 C16,12.8 17.8,11 20,11 C22.2,11 24,12.8 24,15 C24,17.2 22.2,19 20,19 Z"
                                  fill={styleConfig.color}
                                  fillOpacity={styleConfig.opacity}
                                  stroke={styleConfig.outlineColor}
                                  strokeWidth={styleConfig.outlineWidth}
                                  strokeDasharray={outlineDasharray}
                                />
                              </svg>
                            );
                          } else if (styleConfig.markerStyle === 'star') {
                            return (
                              <svg width="40" height="40" viewBox="0 0 40 40" style={{ display: 'block', margin: 'auto' }}>
                                <path 
                                  d="M20,4 L24.5,13.5 L35,15 L27.5,22.5 L29.3,33 L20,28 L10.7,33 L12.5,22.5 L5,15 L15.5,13.5 Z"
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
                              <CustomSelect
                                value={styleConfig.markerStyle || 'circle'} 
                                onChange={(val) => handleUpdateStyle({ markerStyle: val })}
                                options={[
                                  { id: 'circle', title: t('drawMarkerShapeCircle') },
                                  { id: 'square', title: t('drawMarkerShapeSquare') },
                                  { id: 'triangle', title: t('drawMarkerShapeTriangle') },
                                  { id: 'diamond', title: t('drawMarkerShapeDiamond') },
                                  { id: 'cross', title: t('drawMarkerShapeCross') },
                                  { id: 'x', title: t('drawMarkerShapeX') },
                                  { id: 'pin', title: t('drawMarkerShapePin') },
                                  { id: 'star', title: t('drawMarkerShapeStar') }
                                ]}
                              />
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

                          {styleConfig.markerStyle !== 'cross' && styleConfig.markerStyle !== 'x' && (
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
                                    style={{ width: '100%' }}
                                  />
                                  <span style={{ fontSize: '11px' }}>{Math.round(styleConfig.opacity * 100)}%</span>
                                </div>
                              </div>
                            </div>
                          )}

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
                              <CustomSelect
                                value={styleConfig.lineStyle || 'solid'} 
                                onChange={(val) => handleUpdateStyle({ lineStyle: val })}
                                options={[
                                  { id: 'solid', title: t('drawStyleSolid') },
                                  { id: 'dash', title: t('drawStyleDashed') },
                                  { id: 'dot', title: t('drawStyleDotted') },
                                  { id: 'dash-dot', title: t('drawStyleDashDot') }
                                ]}
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
                                  style={{ width: '100%' }}
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
                                  style={{ width: '100%' }}
                                />
                                <span style={{ fontSize: '11px' }}>{Math.round(styleConfig.opacity * 100)}%</span>
                              </div>
                            </div>
                          </div>

                          <div className="form-row">
                            <div className="property-group">
                              <label>{t('drawOutlineStyleLabel')}</label>
                              <CustomSelect
                                value={styleConfig.outlineStyle || 'solid'} 
                                onChange={(val) => handleUpdateStyle({ outlineStyle: val })}
                                options={[
                                  { id: 'solid', title: t('drawStyleSolid') },
                                  { id: 'dash', title: t('drawStyleDashed') },
                                  { id: 'dot', title: t('drawStyleDotted') },
                                  { id: 'dash-dot', title: t('drawStyleDashDot') }
                                ]}
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
                              <label>{t('drawFontFamilyLabel')}</label>
                              <CustomSelect
                                value={styleConfig.fontFamily || 'Inter'} 
                                onChange={(val) => handleUpdateStyle({ fontFamily: val })}
                                options={[
                                  { id: 'Inter', title: 'Inter' },
                                  { id: 'Arial', title: 'Arial' },
                                  { id: 'Times New Roman', title: 'Times New Roman' },
                                  { id: 'Courier New', title: 'Courier New' },
                                  { id: 'Georgia', title: 'Georgia' },
                                  { id: 'Trebuchet MS', title: 'Trebuchet MS' }
                                ]}
                              />
                            </div>
                          </div>

                          <div className="form-row">
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
                            <div className="property-group">
                              <label>{t('drawBackgroundColorLabel')}</label>
                              <input 
                                type="color" 
                                className="color-input" 
                                style={{ width: '100%', height: '40px' }} 
                                value={styleConfig.backgroundColor === 'transparent' ? '#ffffff' : styleConfig.backgroundColor} 
                                onChange={(e) => handleUpdateStyle({ backgroundColor: e.target.value })} 
                              />
                              <label className="checkbox-label" style={{ marginTop: '4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input 
                                  type="checkbox" 
                                  checked={styleConfig.backgroundColor === 'transparent'} 
                                  onChange={(e) => handleUpdateStyle({ backgroundColor: e.target.checked ? 'transparent' : '#ffffff' })} 
                                />
                                Transparent Background
                              </label>
                            </div>
                          </div>

                          <div className="form-row">
                            <div className="property-group">
                              <label>{t('drawFontWeightLabel')}</label>
                              <CustomSelect
                                value={styleConfig.fontWeight || 'normal'} 
                                onChange={(val) => handleUpdateStyle({ fontWeight: val })}
                                options={[
                                  { id: 'normal', title: t('drawFontWeightNormal') },
                                  { id: 'bold', title: t('drawFontWeightBold') }
                                ]}
                              />
                            </div>
                            <div className="property-group">
                              <label>{t('drawFontStyleLabel')}</label>
                              <CustomSelect
                                value={styleConfig.fontStyle || 'normal'} 
                                onChange={(val) => handleUpdateStyle({ fontStyle: val })}
                                options={[
                                  { id: 'normal', title: t('drawFontStyleNormal') },
                                  { id: 'italic', title: t('drawFontStyleItalic') }
                                ]}
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
                               const style = d.style || {};
                                let type = d.type || (d.graphic && d.graphic.geometry ? d.graphic.geometry.type : 'point');
                                if (type === 'polyline-freehand') type = 'polyline';

                                const color = style.color || '#df261c';
                                const outlineColor = style.outlineColor || color || '#df261c';
                                const outlineWidth = style.outlineWidth !== undefined ? style.outlineWidth : 2;
                                
                                if (type === 'polyline') {
                                  let strokeDasharray = "none";
                                  if (style.lineStyle === 'dash') strokeDasharray = "3,2";
                                  else if (style.lineStyle === 'dot') strokeDasharray = "1,1";
                                  else if (style.lineStyle === 'dash-dot') strokeDasharray = "4,2,1,2";
                                  
                                  return (
                                    <svg width="24" height="12" style={{ display: 'block' }}>
                                      <line 
                                        x1="0" 
                                        y1="6" 
                                        x2="24" 
                                        y2="6" 
                                        stroke={color} 
                                        strokeWidth={Math.max(2, Math.min(4, outlineWidth))} 
                                        strokeDasharray={strokeDasharray}
                                        opacity={1}
                                      />
                                    </svg>
                                  );
                                }
                                
                                if (type === 'text') {
                                  const textBg = style.backgroundColor === 'transparent' ? 'transparent' : (style.backgroundColor || 'transparent');
                                  const textWeight = style.fontWeight || 'normal';
                                  const textStyle = style.fontStyle || 'normal';
                                  return (
                                    <span style={{ 
                                      color: color, 
                                      fontSize: '11px', 
                                      fontFamily: style.fontFamily || 'Inter',
                                      fontWeight: textWeight, 
                                      fontStyle: textStyle,
                                      backgroundColor: textBg,
                                      padding: '1px 3px',
                                      borderRadius: '2px',
                                      border: outlineWidth > 0 ? `1px solid ${outlineColor}` : 'none'
                                    }}>
                                      T
                                    </span>
                                  );
                                }
                                
                                if (type === 'polygon' || type === 'circle' || type === 'rectangle' || type === 'extent') {
                                  let outlineDasharray = "none";
                                  if (style.outlineStyle === 'dash') outlineDasharray = "3,2";
                                  else if (style.outlineStyle === 'dot') outlineDasharray = "1,1";
                                  else if (style.outlineStyle === 'dash-dot') outlineDasharray = "4,2,1,2";
                                  
                                  return (
                                    <svg width="16" height="16" style={{ display: 'block' }}>
                                      <rect 
                                        x="1.5" 
                                        y="1.5" 
                                        width="13" 
                                        height="13" 
                                        fill={color} 
                                        fillOpacity={style.opacity !== undefined ? Math.max(0.2, style.opacity) : 0.8}
                                        stroke={outlineColor} 
                                        strokeWidth={Math.max(1, Math.min(2, outlineWidth))} 
                                        strokeDasharray={outlineDasharray}
                                        rx={type === 'circle' ? '6.5' : '1'}
                                        ry={type === 'circle' ? '6.5' : '1'}
                                      />
                                    </svg>
                                  );
                                }
                                
                                // Default / Point Marker fallback
                                let outlineDasharray = "none";
                                if (style.outlineStyle === 'dash') outlineDasharray = "2,1";
                                else if (style.outlineStyle === 'dot') outlineDasharray = "1,1";
                                
                                const marker = style.markerStyle || 'circle';
                                const opacity = style.opacity !== undefined ? Math.max(0.3, style.opacity) : 0.8;
                                
                                if (marker === 'circle') {
                                  return (
                                    <svg width="16" height="16" style={{ display: 'block' }}>
                                      <circle 
                                        cx="8" 
                                        cy="8" 
                                        r="6.5" 
                                        fill={color} 
                                        fillOpacity={opacity}
                                        stroke={outlineColor || '#ffffff'} 
                                        strokeWidth={Math.max(1, Math.min(2, outlineWidth))}
                                        strokeDasharray={outlineDasharray}
                                      />
                                    </svg>
                                  );
                                } else if (marker === 'square') {
                                  return (
                                    <svg width="16" height="16" style={{ display: 'block' }}>
                                      <rect 
                                        x="2" 
                                        y="2" 
                                        width="12" 
                                        height="12" 
                                        fill={color} 
                                        fillOpacity={opacity}
                                        stroke={outlineColor || '#ffffff'} 
                                        strokeWidth={Math.max(1, Math.min(2, outlineWidth))}
                                        strokeDasharray={outlineDasharray}
                                      />
                                    </svg>
                                  );
                                } else if (marker === 'triangle') {
                                  return (
                                    <svg width="16" height="16" style={{ display: 'block' }}>
                                      <polygon 
                                        points="8,2 2,14 14,14"
                                        fill={color} 
                                        fillOpacity={opacity}
                                        stroke={outlineColor || '#ffffff'} 
                                        strokeWidth={Math.max(1, Math.min(2, outlineWidth))}
                                        strokeDasharray={outlineDasharray}
                                      />
                                    </svg>
                                  );
                                } else if (marker === 'diamond') {
                                  return (
                                    <svg width="16" height="16" style={{ display: 'block' }}>
                                      <polygon 
                                        points="8,2 14,8 8,14 2,8"
                                        fill={color} 
                                        fillOpacity={opacity}
                                        stroke={outlineColor || '#ffffff'} 
                                        strokeWidth={Math.max(1, Math.min(2, outlineWidth))}
                                        strokeDasharray={outlineDasharray}
                                      />
                                    </svg>
                                  );
                                } else if (marker === 'cross') {
                                  return (
                                    <svg width="16" height="16" style={{ display: 'block' }}>
                                      <path 
                                        d="M8,2 L8,14 M2,8 L14,8" 
                                        stroke={outlineColor || '#df261c'} 
                                        strokeWidth={Math.max(2, Math.min(3, outlineWidth))}
                                        strokeDasharray={outlineDasharray}
                                      />
                                    </svg>
                                  );
                                } else if (marker === 'x') {
                                  return (
                                    <svg width="16" height="16" style={{ display: 'block' }}>
                                      <path 
                                        d="M3,3 L13,13 M13,3 L3,13" 
                                        stroke={outlineColor || '#df261c'} 
                                        strokeWidth={Math.max(2, Math.min(3, outlineWidth))}
                                        strokeDasharray={outlineDasharray}
                                      />
                                    </svg>
                                  );
                                } else if (marker === 'pin') {
                                  return (
                                    <svg width="16" height="16" viewBox="0 0 40 40" style={{ display: 'block' }}>
                                      <path 
                                        d="M20,4 C14,4 9,9 9,15 C9,23.5 20,36 20,36 C20,36 31,23.5 31,15 C31,9 26,4 20,4 Z M20,19 C17.8,19 16,17.2 16,15 C16,12.8 17.8,11 20,11 C22.2,11 24,12.8 24,15 C24,17.2 22.2,19 20,19 Z"
                                        fill={color}
                                        fillOpacity={opacity}
                                        stroke={outlineColor || '#ffffff'}
                                        strokeWidth={Math.max(2, Math.min(4, outlineWidth))}
                                        strokeDasharray={outlineDasharray}
                                      />
                                    </svg>
                                  );
                                } else if (marker === 'star') {
                                  return (
                                    <svg width="16" height="16" viewBox="0 0 40 40" style={{ display: 'block' }}>
                                      <path 
                                        d="M20,4 L24.5,13.5 L35,15 L27.5,22.5 L29.3,33 L20,28 L10.7,33 L12.5,22.5 L5,15 L15.5,13.5 Z"
                                        fill={color}
                                        fillOpacity={opacity}
                                        stroke={outlineColor || '#ffffff'}
                                        strokeWidth={Math.max(2, Math.min(4, outlineWidth))}
                                        strokeDasharray={outlineDasharray}
                                      />
                                    </svg>
                                  );
                                }
                                
                                return (
                                  <svg width="16" height="16" style={{ display: 'block' }}>
                                    <circle cx="8" cy="8" r="6" fill={color} opacity="1" />
                                  </svg>
                                );
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
