import React, { useEffect, useRef, useState } from 'react';
import esriConfig from '@arcgis/core/config';
import Map from '@arcgis/core/Map';
import WebMap from '@arcgis/core/WebMap';
import MapView from '@arcgis/core/views/MapView';
import SceneView from '@arcgis/core/views/SceneView';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import TileLayer from '@arcgis/core/layers/TileLayer';
import MapImageLayer from '@arcgis/core/layers/MapImageLayer';
import * as projection from "@arcgis/core/geometry/projectionUtils";
import SceneLayer from '@arcgis/core/layers/SceneLayer';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import Swipe from '@arcgis/core/widgets/Swipe';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import Polyline from '@arcgis/core/geometry/Polyline';
import Point from '@arcgis/core/geometry/Point';
import HeatmapRenderer from '@arcgis/core/renderers/HeatmapRenderer';
import SketchViewModel from '@arcgis/core/widgets/Sketch/SketchViewModel';
import Query from '@arcgis/core/rest/support/Query';
import Basemap from '@arcgis/core/Basemap';
import { layersConfig } from '../layers';

// Import ArcGIS CSS
import '@arcgis/core/assets/esri/themes/light/main.css';

// ─── ArcGIS Request Configuration (Local Development Proxy) ──────────────────
// Resolves CORS and 504 Gateway Timeout issues by routing requests through 
// the Vite dev server proxy.
if (!esriConfig.request.interceptors.some(i => i.urls === "https://gis9.smartgeoapps.com")) {
  esriConfig.request.interceptors.push({
    urls: "https://gis9.smartgeoapps.com",
    before: function(params) {
      if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        const originalUrl = params.url;
        params.url = params.url.replace("https://gis9.smartgeoapps.com", "/arcgis-proxy");
        // Ensure no credentials are sent to bypass potential CORS preflight issues
        params.requestOptions = { ...params.requestOptions, withCredentials: false };
        console.log(`[ArcGIS Request] ${originalUrl} -> ${params.url}`);
      }
    },
    error: function(error) {
      if (error.name === "TimeoutError") {
        console.warn("[ArcGIS] Request timed out. Service might be slow.");
      }
    }
  });
}

esriConfig.request.timeout = 60000; // Increased to 60s for slow enterprise servers
esriConfig.request.useIdentity = false;

const ArcGISMap = ({ 
  layerVisibility, onViewReady, isSplitMode, splitLayers, splitBasemaps,
  blendSettings, arcadeSettings, onArcadePreview, 
  spatialSettings, onSpatialResult, 
  timelapseSettings, onTimelapseYearChange, 
  basemap, is3D, swipeMode = 'vertical', onSwipePositionChange,
  activeTool, identifySettings, onIdentifyResults, onIdentifyQueryStart,
  onRequestData, onDataRequestAOIChange, dataRequestDrawingTool
}) => {
  const map2DDiv = useRef(null);
  const map3DDiv = useRef(null);
  const view2DRef = useRef(null);
  const view3DRef = useRef(null);
  const viewRef = useRef(null); 
  const swipeRef = useRef(null);
  const layersRef = useRef({});
  const layers3DRef = useRef({});
  const is2DReady = useRef(false);
  const is3DReady = useRef(false);
  const originalRenderersRef = useRef({});
  const originalLabelingRef = useRef({});
  const originalPopupRef = useRef({});
  const graphicsLayerRef = useRef(new GraphicsLayer());
  const [isLoading, setIsLoading] = useState(true);
  
  // 1. Initialize MapView (2D)
  useEffect(() => {
    if (!map2DDiv.current || is2DReady.current) return;
    
    // Load projection engine
    projection.load().catch(err => console.error("[ArcGIS] Projection engine failed to load:", err));
    
    is2DReady.current = true;

    const map = new Map({
      basemap: basemap || 'streets'
    });

    const view = new MapView({
      container: map2DDiv.current,
      map: map,
      center: [50.55, 26.22],
      zoom: 9,
      ui: { components: [] }
    });

    view2DRef.current = view;
    if (!is3D) viewRef.current = view;

    const loadPromises = layersConfig.map(config => {
      // Reuse existing layer instance if already created in this ref
      if (layersRef.current[config.id]) return layersRef.current[config.id].load();

      const commonProps = {
        id: config.id,
        url: config.url,
        title: config.title,
        visible: false,
        refreshInterval: 0
      };

      let layer;
      if (config.type === 'tile') layer = new TileLayer(commonProps);
      else if (config.type === 'map-image') layer = new MapImageLayer(commonProps);
      else {
        layer = new FeatureLayer({ 
          ...commonProps, 
          popupTemplate: { title: "{*}", content: "{*}" },
          renderer: {
            type: "simple",
            symbol: { type: "simple-marker", color: "red", outline: { color: "white", width: 1 } }
          }
        });
      }

      map.add(layer);
      layersRef.current[config.id] = layer;
      
      const loadPromise = layer.load().then(() => {
        console.log(`[ArcGIS] Layer [${config.id}] loaded. SR:`, layer.spatialReference?.wkid);
        // Immediate sync once loaded to ensure default visibility is applied
        if (layer.type === 'map-image' && layer.allSublayers) {
          layer.allSublayers.forEach(sub => {
            const subKey = `${config.id}_sub_${sub.id}`;
            if (layerVisibility[subKey] !== undefined) {
              sub.visible = !!layerVisibility[subKey];
            }
          });
        }
      }).catch(err => {
        console.error(`[ArcGIS] 2D Layer [${config.id}] load failed:`, err.message);
        return null;
      });

      return loadPromise;
    });

    view.when(() => {
      if (!is3D) {
        setIsLoading(false);
        if (onViewReady) onViewReady(view);
      }
    });

    return () => {
      // Note: We avoid destroying the view here to prevent aborting requests 
      // during rapid UI toggles. The view is managed by the component lifecycle.
    };
  }, []);

  // 2. Initialize SceneView (3D)
  useEffect(() => {
    if (!map3DDiv.current || !is3D || is3DReady.current) return;
    is3DReady.current = true;

    const map = new Map({
      basemap: 'streets',
      ground: 'world-elevation'
    });

    const view = new SceneView({
      container: map3DDiv.current,
      map: map,
      camera: { position: { x: 50.55, y: 26.15, z: 5000 }, tilt: 65, heading: 0 },
      ui: { components: [] }
    });

    view3DRef.current = view;
    if (is3D) viewRef.current = view;

    const buildingsLayer = new SceneLayer({
      url: "https://basemaps3d.arcgis.com/arcgis/rest/services/Esri3D_Buildings_v1/SceneServer",
      title: "3D Buildings", id: "3d-buildings", opacity: 0.8
    });
    map.add(buildingsLayer);

    const loadPromises = layersConfig.map(config => {
      if (layers3DRef.current[config.id]) return layers3DRef.current[config.id].load();

      const commonProps = {
        id: config.id, url: config.url, title: config.title, visible: false,
        elevationInfo: { mode: "relative-to-ground" }
      };

      let layer;
      if (config.type === 'tile') layer = new TileLayer(commonProps);
      else if (config.type === 'map-image') layer = new MapImageLayer(commonProps);
      else layer = new FeatureLayer(commonProps);

      map.add(layer);
      layers3DRef.current[config.id] = layer;
      return layer.load().catch(err => {
        console.error(`[ArcGIS] 3D Layer [${config.id}] load failed:`, err.message);
        return null;
      });
    });

    view.when(() => {
      setIsLoading(false);
      if (onViewReady) onViewReady(view);
    });

    return () => {
      // Keep view alive for persistence
    };
  }, [is3D]);

  // 3. Sync Views
  useEffect(() => {
    const activeView = is3D ? view3DRef.current : view2DRef.current;
    const inactiveView = is3D ? view2DRef.current : view3DRef.current;

    if (activeView) {
      viewRef.current = activeView;
      if (onViewReady) onViewReady(activeView);
      if (inactiveView && inactiveView.ready && activeView.ready) {
        if (is3D) {
          activeView.goTo({ center: inactiveView.center, zoom: inactiveView.zoom });
        } else {
          activeView.center = inactiveView.center;
          activeView.zoom = inactiveView.zoom;
        }
      }
    }
  }, [is3D]);

  // 4. Split / Swipe
  const swipeBasemapLayersRef = useRef({ left: [], right: [] });
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    if (isSplitMode) {
      const leftLayer = layersRef.current[splitLayers.left];
      const rightLayer = layersRef.current[splitLayers.right];

      if (leftLayer && rightLayer) {
        leftLayer.visible = true;
        rightLayer.visible = true;
        Object.keys(layersRef.current).forEach(id => {
          if (id !== splitLayers.left && id !== splitLayers.right) {
            layersRef.current[id].visible = false;
          }
        });
        
        view.when(async () => {
          if (view.destroyed || !isSplitMode) return;
          if (swipeRef.current) {
            view.ui.remove(swipeRef.current);
            swipeRef.current.destroy();
            swipeRef.current = null;
          }
          const swipe = new Swipe({
            view: view,
            leadingLayers: [leftLayer],
            trailingLayers: [rightLayer],
            direction: swipeMode,
            position: 50
          });
          view.ui.add(swipe);
          swipeRef.current = swipe;
        });
      }
    } else {
      if (swipeRef.current) {
        view.ui.remove(swipeRef.current);
        swipeRef.current.destroy();
        swipeRef.current = null;
      }
    }
  }, [isSplitMode, splitLayers, swipeMode, is3D]);

  // ============================================================
  // BLEND TOOL FUNCTIONALITY (IMAGERY COMPARED TO BASEMAP)
  // ============================================================
  const overlayBasemapRef = useRef(null);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || activeTool !== 'blend') {
      if (overlayBasemapRef.current) {
        view.map.removeMany(overlayBasemapRef.current);
        overlayBasemapRef.current = null;
      }
      return;
    }

    const { overlayLayerId, blendMode, opacity } = blendSettings;

    const applyBlend = async () => {
      // 1. Clean up previous overlay
      if (overlayBasemapRef.current) {
        view.map.removeMany(overlayBasemapRef.current);
        overlayBasemapRef.current = null;
      }

      // 2. Add new overlay
      if (overlayLayerId) {
        try {
          const tempBasemap = new Basemap({ portalItem: { id: overlayLayerId } });
          // If it's a standard ID, Basemap.fromId might be better, but we'll try direct id first
          // or use the standard IDs from layersConfig/basemaps
          const bm = Basemap.fromId(overlayLayerId) || new Basemap({ portalItem: { id: overlayLayerId } });
          
          await bm.load();
          const layers = bm.baseLayers.toArray();
          
          layers.forEach(layer => {
            layer.blendMode = blendMode || 'normal';
            layer.opacity = opacity !== undefined ? opacity : 1;
            view.map.add(layer);
          });

          overlayBasemapRef.current = layers;
          if (view.requestRender) view.requestRender();
          console.log(`[Blend] Applied overlay basemap ${overlayLayerId}: ${blendMode} | ${opacity}`);
        } catch (err) {
          console.error(`[Blend] Failed to load overlay basemap ${overlayLayerId}:`, err);
        }
      }
    };

    applyBlend();
  }, [blendSettings, activeTool]);

  // ============================================================
  // TEMPORAL FILTER ENGINE (definitionExpression)
  // ============================================================
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    if (!timelapseSettings || !timelapseSettings.layerId) {
      // Clear temporal filters if tool is inactive
      const temporalLayers = ['sample-data-1', 'service-2', 'service-3']; // From layers.js
      temporalLayers.forEach(id => {
        const targetLayer = view.map.findLayerById(id);
        if (targetLayer) {
          if (targetLayer.type === 'feature') {
            targetLayer.definitionExpression = null;
          } else if (targetLayer.type === 'map-image' && targetLayer.allSublayers) {
            targetLayer.allSublayers.forEach(sub => {
              sub.definitionExpression = null;
            });
          }
        }
      });
      return;
    }

    const applyTemporalFilter = () => {
      const { layerId, fromYear, toYear, timeField } = timelapseSettings;
      const targetLayer = view.map.findLayerById(layerId);
      
      if (targetLayer) {
        const field = timeField || 'SURVEY_YEAR';
        const expression = `${field} >= ${fromYear} AND ${field} <= ${toYear}`;
        
        if (targetLayer.type === 'feature') {
          targetLayer.definitionExpression = expression;
        } else if (targetLayer.type === 'map-image') {
          if (targetLayer.allSublayers) {
            // Check if sublayer actually supports the field before blindly applying
            // For now, we apply to all as per original logic
            targetLayer.allSublayers.forEach(sub => {
              sub.definitionExpression = expression;
            });
          }
        }
        console.log(`[Temporal Filter] Applied to ${layerId}: ${expression}`);
      }
    };

    applyTemporalFilter();
  }, [timelapseSettings, is3D]);

  // 5. Visibility Sync
  useEffect(() => {
    const currentView = viewRef.current;
    const activeLayers = is3D ? layers3DRef.current : layersRef.current;
    if (!activeLayers || !currentView) return;

    try {
      Object.keys(activeLayers).forEach(id => {
        const layer = activeLayers[id];
        if (!layer) return;

        const isVisible = !!layerVisibility[id];
        
        // Update root layer visibility
        if (layer.visible !== isVisible) {
          layer.visible = isVisible;
        }

        // Sync MapImageLayer sublayers
        if (layer.type === 'map-image') {
          const syncAll = () => {
            if (!layer.allSublayers) return;
            
            let changed = false;
            layer.allSublayers.forEach(sub => {
              const subKey = `${id}_sub_${sub.id}`;
              const subVisible = !!layerVisibility[subKey];
              
              if (sub.visible !== subVisible) {
                sub.visible = subVisible;
                changed = true;
              }
              // Force visibility properties to overcome any service defaults
              sub.minScale = 0;
              sub.maxScale = 0;
            });

            // Handle standard child layers (for GroupLayer support)
            if (layer.layers) {
              layer.layers.forEach(child => {
                if (child.visible !== isVisible) {
                  child.visible = isVisible;
                  changed = true;
                }
              });
            }

            if (changed && isVisible) {
              // Ensure layer is fully loaded before navigation or diagnostics
              layer.load().then(() => {
                // Diagnostic check for scale visibility
                if (layer.visibleAtCurrentScale === false) {
                  console.warn(`[ArcGIS] Layer ${id} is not visible at current scale. Resetting restrictions.`);
                  layer.minScale = 0;
                  layer.maxScale = 0;
                }

                // Force redraw
                if (typeof layer.refresh === 'function') layer.refresh();
                
                // Re-assign sublayers to trigger ArcGIS change tracking
                if (layer.sublayers) {
                  layer.sublayers = layer.sublayers.toArray();
                }

                // Re-assign sublayers to trigger ArcGIS change tracking
                if (layer.sublayers) {
                  layer.sublayers = layer.sublayers.toArray();
                }

                // Removed auto-zoom to prevent unwanted "zoom out" behavior
                // The map will now stay at its current position when layers are toggled.
              }).catch(err => console.error(`[ArcGIS] Layer ${id} sync load failed:`, err));
            }
          };

          if (layer.loaded) {
            syncAll();
          } else {
            layer.load().then(syncAll).catch(() => {});
          }
        }
      });
    } catch (err) {
      console.error('Visibility sync error:', err);
    }
  }, [layerVisibility, is3D]);

  // ============================================================
  // ARCADE EXPRESSION ENGINE
  // Key insight: MapImageLayer sublayers are server-rendered.
  // To apply client-side Arcade (labels, renderer), we must create
  // a FeatureLayer from the sublayer URL and apply the expression there.
  // ============================================================

  // Tracks dynamically created Arcade overlay layers so we can remove/replace them
  const arcadeOverlayRef = useRef({});

  const getOrCreateFeatureLayer = async (view, parentId, subId, serviceUrl) => {
    const overlayId = `arcade-overlay-${parentId}-${subId}`;
    let fl = view.map.findLayerById(overlayId);
    if (!fl) {
      fl = new FeatureLayer({
        id: overlayId,
        url: `${serviceUrl}/${subId}`,
        visible: true,
        outFields: ['*']
      });
      view.map.add(fl);
      await fl.load();
      arcadeOverlayRef.current[overlayId] = fl;
    }
    // Always move overlay to top so it renders above MapImageLayers
    view.map.reorder(fl, view.map.layers.length - 1);
    return fl;
  };

  const applyArcadeStyling = async (view, parentId, subIdStr, serviceUrl, expression) => {
    try {
      const fl = await getOrCreateFeatureLayer(view, parentId, subIdStr, serviceUrl);
      fl.renderer = {
        type: 'unique-value',
        valueExpression: expression,
        uniqueValueInfos: [
          { value: 'High',   symbol: { type: 'simple-fill', color: '#df261c', outline: { width: 1, color: 'white' } } },
          { value: 'Medium', symbol: { type: 'simple-fill', color: '#facc15', outline: { width: 1, color: 'white' } } },
          { value: 'Low',    symbol: { type: 'simple-fill', color: '#22c55e', outline: { width: 1, color: 'white' } } }
        ],
        defaultSymbol: { type: 'simple-fill', color: [150, 150, 150, 0.5], outline: { color: 'white', width: 1 } }
      };
    } catch (e) { console.error('Arcade Styling Error:', e); }
  };

  const applyArcadeLabels = async (view, parentId, subIdStr, serviceUrl, expression) => {
    try {
      const fl = await getOrCreateFeatureLayer(view, parentId, subIdStr, serviceUrl);

      // Sanitize: strip 'return' keyword — invalid in the label Arcade profile
      const cleanExpr = expression.trim().replace(/^return\s+/i, '').replace(/;\s*$/g, '').trim();

      const geomType = fl.geometryType;
      const placement = geomType === 'point' ? 'above-center' : 'always-horizontal';

      fl.labelingInfo = [{
        labelPlacement: placement,
        labelExpressionInfo: { expression: cleanExpr },
        where: '1=1',
        symbol: {
          type: 'text',
          color: [30, 41, 59, 1],          // #1e293b as RGBA
          haloColor: [255, 255, 255, 1],
          haloSize: 2,
          font: { size: 13, weight: 'bold', family: 'sans-serif' }
        },
        minScale: 0,
        maxScale: 0
      }];

      fl.labelsVisible = true;
      fl.visible = true;

      console.log('[Arcade] Labels applied to:', fl.url, '| expression:', cleanExpr);
    } catch (e) { console.error('Arcade Labels Error:', e); }
  };

  const applyArcadePopup = async (view, parentId, subIdStr, serviceUrl, expression) => {
    try {
      const fl = await getOrCreateFeatureLayer(view, parentId, subIdStr, serviceUrl);
      fl.popupTemplate = {
        title: 'Arcade Analysis Result',
        content: [{ type: 'text', text: 'Computed Value: <b style="color:#df261c">{expression/custom-arcade}</b>' }],
        expressionInfos: [{ name: 'custom-arcade', title: 'Result', expression }]
      };
      fl.visible = true;
    } catch (e) { console.error('Arcade Popup Error:', e); }
  };

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !arcadeSettings?.lastRun) return;

    const runArcade = async () => {
      try {
        const rawId = arcadeSettings.layerId || '';

        // ── Resolve target ─────────────────────────────────────────
        // IDs from ArcadePanel are in format: "parentLayerId:::sub:::subLayerId"
        // or just "parentLayerId" for simple feature layers
        let parentId, subIdStr, serviceUrl, targetFL;

        if (rawId.includes(':::sub:::')) {
          const parts = rawId.split(':::sub:::');
          parentId = parts[0];
          subIdStr = parts[1];

          const parentLayer = view.map.findLayerById(parentId);
          if (!parentLayer) {
            console.warn('Arcade: Parent layer not found:', parentId);
            return;
          }
          serviceUrl = parentLayer.url;
        } else {
          // Direct feature layer
          targetFL = view.map.findLayerById(rawId);
          if (!targetFL) {
            console.warn('Arcade: Layer not found:', rawId);
            return;
          }
          parentId = rawId;
          subIdStr = null;
          serviceUrl = targetFL.url;
        }

        // ── Focus only (layer selection step) ─────────────────────
        if (arcadeSettings.focusOnly) {
          const focusLayer = view.map.findLayerById(parentId);
          if (focusLayer) {
            focusLayer.visible = true;
            try {
              if (focusLayer.fullExtent) {
                await view.goTo({ target: focusLayer.fullExtent, zoom: 12 });
              }
            } catch (_) {}
          }
          return;
        }

        // ── Apply expression ───────────────────────────────────────
        const { expression, applyTo } = arcadeSettings;

        if (applyTo === 'Styling') {
          await applyArcadeStyling(view, parentId, subIdStr, serviceUrl, expression);
        } else if (applyTo === 'Labels') {
          await applyArcadeLabels(view, parentId, subIdStr, serviceUrl, expression);
        } else if (applyTo === 'Popup') {
          await applyArcadePopup(view, parentId, subIdStr, serviceUrl, expression);
        }
      } catch (err) {
        console.error('Arcade Engine Error:', err);
      }
    };

    runArcade();
  }, [arcadeSettings?.lastRun]);


  // Identify Logic
  const identifyGraphicsLayer = useRef(new GraphicsLayer({ id: 'identify-highlights' }));
  const sketchLayer = useRef(new GraphicsLayer({ id: 'identify-sketch-layer' }));
  const sketchVM = useRef(null);

  useEffect(() => {
    const view = viewRef.current;
    if (view) {
      view.when(() => {
        if (!view.map.findLayerById('identify-highlights')) view.map.add(identifyGraphicsLayer.current);
        if (!view.map.findLayerById('identify-sketch-layer')) view.map.add(sketchLayer.current);
      });
    }
  }, [is3D]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || activeTool !== 'identify') {
      if (sketchVM.current) sketchVM.current.cancel();
      return;
    }
    
    view.cursor = 'crosshair';

    if (!sketchVM.current) {
      sketchVM.current = new SketchViewModel({
        view: view,
        layer: sketchLayer.current,
        pointSymbol: { type: "simple-marker", style: "cross", size: 12, outline: { color: "#df261c", width: 2 } },
        rectangleSymbol: { type: "simple-fill", color: [223, 38, 28, 0.1], outline: { color: "#df261c", width: 2 } },
        polygonSymbol: { type: "simple-fill", color: [223, 38, 28, 0.1], outline: { color: "#df261c", width: 2 } }
      });

      sketchVM.current.on(['create', 'update'], (event) => {
        if (event.state === 'complete') {
          const geometry = event.graphic ? event.graphic.geometry : event.graphics[0].geometry;
          performQuery(geometry);
          sketchLayer.current.removeAll();
          // Keep tool active
          if (identifySettings.mode === 'rectangle') sketchVM.current.create('rectangle');
          if (identifySettings.mode === 'polygon') sketchVM.current.create('polygon');
        }
      });
    }

    const performQuery = async (geometry) => {
      onIdentifyQueryStart();
      const results = { total: 0, grouped: {} };
      identifyGraphicsLayer.current.removeAll();

      // Determine which layers to query
      const layersToQuery = [];
      layersConfig.forEach(config => {
        const layer = layersRef.current[config.id];
        if (!layer) return;

        if (identifySettings.selectedLayerId === 'all') {
          if (layer.type === 'feature' && layerVisibility[config.id]) {
            layersToQuery.push({ layer, title: config.title, config });
          } else if (layer.type === 'map-image') {
            layer.allSublayers.forEach(sub => {
              if (sub.visible && layerVisibility[`${config.id}_sub_${sub.id}`]) {
                layersToQuery.push({ layer: sub, title: sub.title, config, parentId: config.id });
              }
            });
          }
        } else {
          // Specific layer selected
          if (identifySettings.selectedLayerId === config.id && layer.type === 'feature') {
            layersToQuery.push({ layer, title: config.title, config });
          } else if (layer.type === 'map-image') {
            const subIdMatch = identifySettings.selectedLayerId.match(/_sub_(\d+)$/);
            if (subIdMatch) {
              const subId = parseInt(subIdMatch[1]);
              const sub = layer.allSublayers.find(s => s.id === subId);
              if (sub) layersToQuery.push({ layer: sub, title: sub.title, config, parentId: config.id });
            }
          }
        }
      });

      await Promise.all(layersToQuery.map(async (item) => {
        try {
          const response = await item.layer.queryFeatures({ 
            geometry, 
            spatialRelationship: 'intersects', 
            outFields: ['*'], 
            returnGeometry: true 
          });

          if (response.features.length > 0) {
            results.total += response.features.length;
            results.grouped[item.title] = response.features.map(f => ({ 
              attributes: f.attributes,
              geometry: f.geometry,
              layerId: item.config.id,
              layerTitle: item.title,
              displayField: item.layer.displayField || 'OBJECTID'
            }));

            response.features.forEach(f => {
              const highlightSymbol = f.geometry.type === 'point' 
                ? { type: "simple-marker", style: "circle", color: [0, 255, 255, 0.4], outline: { color: "cyan", width: 2 } }
                : { type: "simple-fill", color: [0, 255, 255, 0.1], outline: { color: "cyan", width: 2 } };

              identifyGraphicsLayer.current.add(new Graphic({
                geometry: f.geometry,
                symbol: highlightSymbol
              }));
            });
          }
        } catch (err) {
          console.warn(`Query failed for layer ${item.title}:`, err);
        }
      }));
      onIdentifyResults(results);
    };

    let clickHandler;
    if (identifySettings.mode === 'point') {
      clickHandler = view.on('click', (e) => performQuery(e.mapPoint));
    } else {
      sketchVM.current.create(identifySettings.mode);
    }

    return () => {
      if (clickHandler) clickHandler.remove();
      if (sketchVM.current) sketchVM.current.cancel();
      view.cursor = 'default';
    };
  }, [activeTool, identifySettings.mode, identifySettings.selectedLayerId, layerVisibility]);

  // Data Request
  const dataRequestLayer = useRef(new GraphicsLayer({ id: 'data-request-aoi-layer' }));
  const dataRequestFinalLayer = useRef(new GraphicsLayer({ id: 'data-request-final-layer' }));
  const dataRequestSketchVM = useRef(null);

  useEffect(() => {
    const view = viewRef.current;
    if (view) {
      view.when(() => {
        if (!view.map.findLayerById('data-request-aoi-layer')) view.map.add(dataRequestLayer.current);
        if (!view.map.findLayerById('data-request-final-layer')) view.map.add(dataRequestFinalLayer.current);
      });
    }
  }, [is3D]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || activeTool !== 'data_request') return;

    if (!dataRequestSketchVM.current) {
      dataRequestSketchVM.current = new SketchViewModel({
        view: view,
        layer: dataRequestLayer.current,
        polygonSymbol: { type: "simple-fill", color: [223, 38, 28, 0.1], outline: { color: "#df261c", width: 2, style: "dash" } }
      });
      dataRequestSketchVM.current.on('create', (event) => {
        if (event.state === 'complete') {
          const geometry = event.graphic.geometry;
          onDataRequestAOIChange(geometry, [], true);
          dataRequestFinalLayer.current.add(event.graphic.clone());
          dataRequestLayer.current.removeAll();
        }
      });
    }
    dataRequestSketchVM.current.create(dataRequestDrawingTool || 'polygon');
  }, [activeTool, dataRequestDrawingTool]);

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <div ref={map2DDiv} id="mapViewDiv" style={{ height: '100%', width: '100%', position: 'absolute', visibility: is3D ? 'hidden' : 'visible' }} />
      <div ref={map3DDiv} id="sceneViewDiv" style={{ height: '100%', width: '100%', position: 'absolute', visibility: is3D ? 'visible' : 'hidden' }} />
      {isLoading && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(255, 255, 255, 0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="loader" style={{ border: '3px solid #f3f3f3', borderTop: '3px solid #1a2f4d', borderRadius: '50%', width: '32px', height: '32px', animation: 'spin 1s linear infinite' }}></div>
        </div>
      )}
    </div>
  );
};

export default ArcGISMap;
