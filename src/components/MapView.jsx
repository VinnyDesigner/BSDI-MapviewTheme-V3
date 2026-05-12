import React, { useEffect, useRef, useState } from 'react';
import Map from '@arcgis/core/Map';
import WebMap from '@arcgis/core/WebMap';
import MapView from '@arcgis/core/views/MapView';
import SceneView from '@arcgis/core/views/SceneView';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import TileLayer from '@arcgis/core/layers/TileLayer';
import * as projection from "@arcgis/core/geometry/projectionUtils";
import * as arcade from "@arcgis/core/arcade/arcade";
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
  const viewRef = useRef(null); // Active view
  const swipeRef = useRef(null);
  const layersRef = useRef({});
  const layers3DRef = useRef({});
  const graphicsLayerRef = useRef(new GraphicsLayer());
  const [isLoading, setIsLoading] = useState(true);
  
  // 1. Initialize MapView (2D)
  useEffect(() => {
    if (!map2DDiv.current || view2DRef.current) return;

    const map = new Map({
      basemap: basemap || 'streets-navigation-vector'
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

    // Load layers into 2D map
    layersConfig.forEach(config => {
      const LayerClass = config.type === 'tile' ? TileLayer : FeatureLayer;
      const layer = new LayerClass({
        id: config.id,
        url: config.url,
        title: config.title,
        visible: false,
        popupTemplate: config.type !== 'tile' ? { title: "{*}", content: "{*}" } : null
      });
      map.add(layer);
      layersRef.current[config.id] = layer;
    });

    view.when(() => {
      if (!is3D) {
        setIsLoading(false);
        if (onViewReady) onViewReady(view);
      }
    });

    return () => {
      // Don't destroy immediately to allow fast switching, 
      // but in a real app you might want to cleanup if unmounting the whole component
    };
  }, []);

  // 2. Initialize SceneView (3D) - Only when first needed
  useEffect(() => {
    if (!map3DDiv.current || view3DRef.current || !is3D) return;

    // Use a 3D-compatible basemap and set ground elevation (required for SceneView)
    const map = new Map({
      basemap: 'topo-3d',           // 3D-compatible basemap
      ground: 'world-elevation'     // Essential — without this SceneView is blank
    });

    const view = new SceneView({
      container: map3DDiv.current,
      map: map,
      camera: {
        position: { x: 50.55, y: 26.15, z: 5000 },
        tilt: 65,
        heading: 0
      },
      ui: { components: [] }
    });

    view3DRef.current = view;
    if (is3D) viewRef.current = view;

    // Add 3D Buildings
    const buildingsLayer = new SceneLayer({
      url: "https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings/SceneServer",
      title: "3D Buildings",
      id: "3d-buildings",
      popupEnabled: false,
      opacity: 0.8
    });
    map.add(buildingsLayer);

    // =======================================
    // BSDI 3D Building — Only in SceneView
    // =======================================
    const buildingLayer = new GraphicsLayer({
      title: "BSDI Demo Building",
      id: "bsdi-building-layer"
    });
    map.add(buildingLayer);

    const buildingPoint = new Point({
      longitude: 50.5478,
      latitude: 26.2212,
      z: 0
    });

    const buildingGraphic = new Graphic({
      geometry: buildingPoint,
      symbol: {
        type: "point-3d",
        symbolLayers: [{
          type: "object",
          resource: { href: "/models/bsdi-building.glb" },
          anchor: "bottom",
          width: 80,
          height: 80,
          depth: 80
        }]
      }
    });

    buildingLayer.add(buildingGraphic);

    // Camera + Lighting
    view.when(() => {
      view.environment = {
        lighting: {
          directShadowsEnabled: true,
          ambientOcclusionEnabled: true
        }
      };
      view.goTo({
        target: buildingPoint,
        zoom: 19,
        tilt: 75,
        heading: 45
      }, { duration: 3000 });
    });

    // Load layers into 3D map
    layersConfig.forEach(config => {
      const LayerClass = config.type === 'tile' ? TileLayer : FeatureLayer;
      const layer = new LayerClass({
        id: config.id,
        url: config.url,
        title: config.title,
        visible: false
      });
      if (config.renderer) layer.renderer = config.renderer;
      map.add(layer);
      layers3DRef.current[config.id] = layer;
    });

    view.when(() => {
      setIsLoading(false);
      if (onViewReady) onViewReady(view);
    }).catch(err => {
      console.error('SceneView failed to load:', err);
      setIsLoading(false);
    });
  }, [is3D]);

  // 3. Handle View Switching & State Sync
  useEffect(() => {
    const activeView = is3D ? view3DRef.current : view2DRef.current;
    const inactiveView = is3D ? view2DRef.current : view3DRef.current;

    if (activeView) {
      viewRef.current = activeView;
      if (onViewReady) onViewReady(activeView);
      
      // Sync state from inactive to active
      if (inactiveView && inactiveView.ready && activeView.ready) {
        if (is3D) {
          // Sync 2D -> 3D
          activeView.goTo({
            center: inactiveView.center,
            zoom: inactiveView.zoom
          });
        } else {
          // Sync 3D -> 2D
          activeView.center = inactiveView.center;
          activeView.zoom = inactiveView.zoom;
        }
      }
    }
  }, [is3D]);
  // 2. Manage Split Visibility & Swipe Logic (Targeting LEFT/RIGHT comparison)
  const swipeBasemapLayersRef = useRef({ left: [], right: [] });

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    if (isSplitMode) {
      const leftLayer = layersRef.current[splitLayers.left];
      const rightLayer = layersRef.current[splitLayers.right];

      if (leftLayer && rightLayer) {
        // 1. Force visibility for comparison
        leftLayer.visible = true;
        rightLayer.visible = true;
        
        // Hide others (including buildings in 3D if present)
        Object.keys(layersRef.current).forEach(id => {
          if (id !== splitLayers.left && id !== splitLayers.right) {
            layersRef.current[id].visible = false;
          }
        });
        
        // Specifically hide buildings in 3D to ensure clean comparison
        const buildingsLayer = view.map.findLayerById('3d-buildings');
        if (buildingsLayer) buildingsLayer.visible = false;

        // 3. Create fresh swipe with current mode after view is ready
        view.when(async () => {
          if (view.destroyed || !isSplitMode) return;

          // Load basemap layers
          let leftBaseLayers = [];
          let rightBaseLayers = [];

          if (splitBasemaps && splitBasemaps.left) {
            const leftBm = Basemap.fromId(splitBasemaps.left);
            await leftBm.load();
            leftBaseLayers = leftBm.baseLayers.toArray();
          }

          if (splitBasemaps && splitBasemaps.right) {
            const rightBm = Basemap.fromId(splitBasemaps.right);
            await rightBm.load();
            rightBaseLayers = rightBm.baseLayers.toArray();
          }

          if (view.destroyed || !isSplitMode) return;

          // Clear existing swipe
          if (swipeRef.current) {
            try {
              view.ui.remove(swipeRef.current);
              swipeRef.current.destroy();
            } catch (e) {}
            swipeRef.current = null;
          }

          // Remove previously added swipe basemap layers
          view.map.removeMany([...swipeBasemapLayersRef.current.left, ...swipeBasemapLayersRef.current.right]);

          // Add new basemap layers to the bottom of the map
          view.map.addMany([...leftBaseLayers, ...rightBaseLayers], 0);
          swipeBasemapLayersRef.current = { left: leftBaseLayers, right: rightBaseLayers };

          const swipe = new Swipe({
            view: view,
            leadingLayers: [...leftBaseLayers, leftLayer],
            trailingLayers: [...rightBaseLayers, rightLayer],
            direction: swipeMode,   // 'vertical' or 'horizontal'
            position: swipeRef.current?.position || 50
          });

          view.ui.add(swipe);
          swipeRef.current = swipe;

          // Emit both dimensions so parent can handle either mode
          const emitPos = (pos) => {
            if (onSwipePositionChange) {
              onSwipePositionChange({ position: pos, viewWidth: view.width, viewHeight: view.height });
            }
          };

          swipe.watch('position', emitPos);
          emitPos(50); // initial
        });
      }
    } else {
      // Restore normal view architecture
      if (swipeRef.current) {
        try {
          view.ui.remove(swipeRef.current);
          swipeRef.current.destroy();
        } catch (e) {}
        swipeRef.current = null;
      }

      // Remove basemap layers
      if (view.map) {
        view.map.removeMany([...swipeBasemapLayersRef.current.left, ...swipeBasemapLayersRef.current.right]);
      }
      swipeBasemapLayersRef.current = { left: [], right: [] };
      
      Object.keys(layersRef.current).forEach(id => {
        if (layersRef.current[id]) {
          layersRef.current[id].visible = !!layerVisibility[id];
        }
      });

      // Restore buildings in 3D
      const buildingsLayer = view.map.findLayerById('3d-buildings');
      if (buildingsLayer) buildingsLayer.visible = is3D;
    }
  }, [isSplitMode, splitLayers, splitBasemaps, layerVisibility, swipeMode, is3D]);

  // 4. Manage Layer Blending
  useEffect(() => {
    const view = viewRef.current;
    if (!view || isSplitMode) return;

    if (blendSettings && blendSettings.baseLayerId && blendSettings.overlayLayerId) {
      const base = layersRef.current[blendSettings.baseLayerId];
      const overlay = layersRef.current[blendSettings.overlayLayerId];

      if (base && overlay) {
        // 1. Hide other layers and reset properties
        Object.keys(layersRef.current).forEach(id => {
          const layer = layersRef.current[id];
          if (layer && id !== blendSettings.baseLayerId && id !== blendSettings.overlayLayerId) {
            layer.visible = false;
            layer.opacity = 1;
            layer.blendMode = 'normal';
          }
        });

        // 2. Setup base layer (bottom)
        base.visible = true;
        base.opacity = 1;
        base.blendMode = 'normal';
        view.map.reorder(base, 0);

        // 3. Setup overlay layer (top)
        overlay.visible = true;
        overlay.opacity = blendSettings.opacity;
        overlay.blendMode = blendSettings.blendMode;
        view.map.reorder(overlay, 1);
      } else if (overlay) {
        // Only overlay is a valid operational layer, base might be a basemap
        overlay.visible = true;
        overlay.opacity = blendSettings.opacity;
        overlay.blendMode = blendSettings.blendMode;
        view.map.reorder(overlay, view.map.layers.length); // Top
      }
    }

    // Function to sync visibility for both 2D and 3D layers
    const syncVisibility = (layersMap, visibilityMap) => {
      Object.keys(layersMap).forEach(id => {
        const layer = layersMap[id];
        if (layer) {
          layer.visible = !!visibilityMap[id];
          layer.opacity = 1;
          layer.blendMode = 'normal';
        }
      });
    };

    if (isSplitMode) {
      // Split mode logic (only for 2D currently as per existing app patterns)
      const leftLayer = layersRef.current[splitLayers.left];
      const rightLayer = layersRef.current[splitLayers.right];
      if (leftLayer) leftLayer.visible = true;
      if (rightLayer) rightLayer.visible = true;
      
      Object.keys(layersRef.current).forEach(id => {
        if (id !== splitLayers.left && id !== splitLayers.right) {
          layersRef.current[id].visible = false;
        }
      });
    } else if (blendSettings?.layerId) {
      // Blend logic
      syncVisibility(layersRef.current, layerVisibility);
      syncVisibility(layers3DRef.current, layerVisibility);
      
      const overlay = layersRef.current[blendSettings.layerId];
      if (overlay) {
        overlay.visible = true;
        overlay.opacity = blendSettings.opacity;
        overlay.blendMode = blendSettings.blendMode;
      }
    } else {
      // Standard sync
      syncVisibility(layersRef.current, layerVisibility);
      syncVisibility(layers3DRef.current, layerVisibility);
    }
  }, [blendSettings, layerVisibility, isSplitMode, is3D]);

  // 5. Manage Arcade Expressions
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !arcadeSettings?.lastRun) return;

    const activeLayers = is3D ? layers3DRef.current : layersRef.current;
    const layer = activeLayers[arcadeSettings.layerId];
    if (!layer) return;

    const { expression, applyTo } = arcadeSettings;

    try {
      if (applyTo === 'Styling') {
        // Apply Arcade to Renderer
        layer.renderer = {
          type: "simple",
          symbol: layer.renderer.symbol || {
            type: "simple-fill",
            color: [150, 150, 150, 0.5],
            outline: { color: [255, 255, 255, 0.8], width: 1 }
          },
          visualVariables: [{
            type: "color",
            valueExpression: expression,
            stops: [
              { value: 0, color: "#f7fcf0" },
              { value: 10, color: "#e0f3db" },
              { value: 50, color: "#a8ddb5" },
              { value: 100, color: "#084081" }
            ]
          }]
        };
      } else if (applyTo === 'Labels') {
        // Apply Arcade to Labeling
        layer.labelingInfo = [{
          labelPlacement: "above-center",
          labelExpressionInfo: { expression },
          symbol: {
            type: "text",
            color: "white",
            haloColor: "#1e3c72",
            haloSize: "1.5px",
            font: { size: 11, weight: "bold", family: "Inter" }
          }
        }];
        layer.labelsVisible = true;
      } else if (applyTo === 'Popup') {
        // Apply Arcade to Popups
        layer.popupTemplate = {
          title: "Arcade Result",
          content: [{
            type: "text",
            text: `Calculated Value: <b>{expression/custom-arcade}</b>`
          }],
          expressionInfos: [{
            name: "custom-arcade",
            title: "Result",
            expression: expression
          }]
        };
      } else if (applyTo === 'Filtering') {
        // We use visual variables to hide features based on Arcade truthiness
        layer.renderer = {
          type: "simple",
          symbol: layer.renderer.symbol || { type: "simple-fill", color: "#1e3c72" },
          visualVariables: [{
            type: "opacity",
            valueExpression: `if (${expression}) { return 1; } else { return 0; }`,
            stops: [
              { value: 0, opacity: 0 },
              { value: 1, opacity: 1 }
            ]
          }]
        };
      }
      
      // Refresh layer
      layer.refresh();
    } catch (err) {
      console.error("Arcade Apply Error:", err);
    }
  }, [arcadeSettings?.lastRun]);

  // 6. Live Arcade Preview
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !arcadeSettings?.expression || !onArcadePreview) {
      if (onArcadePreview && !arcadeSettings?.expression) onArcadePreview('Enter expression to see preview');
      return;
    }

    const activeLayers = is3D ? layers3DRef.current : layersRef.current;
    const layer = activeLayers[arcadeSettings.layerId];
    if (!layer) return;

    const evalPreview = async () => {
      try {
        await layer.when();
        const results = await layer.queryFeatures({
          where: "1=1",
          outFields: ["*"],
          num: 1,
          returnGeometry: true
        });

        if (results.features.length > 0) {
          const feature = results.features[0];
          const expr = arcadeSettings.expression.trim();
          
          try {
            // Create a real Arcade executor
            const executor = await arcade.createArcadeExecutor(expr, {
              profile: "popup" // Use popup profile as it's the most flexible for attribute access
            });

            const result = await executor.execute({
              $feature: feature
            });

            onArcadePreview(String(result), feature.attributes);
          } catch (arcadeErr) {
            onArcadePreview(`Syntax Error: ${arcadeErr.message}`, null);
          }
        } else {
          onArcadePreview("No sample features found in layer", null);
        }
      } catch (err) {
        console.error("Preview Eval Error:", err);
        onArcadePreview("Evaluation Error: Check field names", null);
      }
    };

    const timer = setTimeout(evalPreview, 400);
    return () => clearTimeout(timer);
  }, [arcadeSettings?.expression, arcadeSettings?.layerId]);

  // 7. Handle Spatial Analysis Operations
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    // Create or find analysis layer
    let analysisLayer = view.map.findLayerById('analysis-layer');
    if (!analysisLayer) {
      analysisLayer = new GraphicsLayer({ id: 'analysis-layer' });
      view.map.add(analysisLayer);
    }

    if (!spatialSettings?.lastRun) {
      analysisLayer.removeAll();
      // Restore renderers if they were changed for heatmap
      layersConfig.forEach(l => {
        const layer = layersRef.current[l.id];
        if (layer && layer.originalRenderer) {
          layer.renderer = layer.originalRenderer;
        }
      });
      return;
    }

    const { subTool, layerId, bufferDistance, bufferUnit, isWaitingForClick } = spatialSettings;
    const activeLayers = is3D ? layers3DRef.current : layersRef.current;
    const layer = activeLayers[layerId];
    if (!layer) return;

    let clickHandler = null;
    if (isWaitingForClick) {
      clickHandler = view.on("click", async (event) => {
        try {
          const results = await layer.queryFeatures();
          if (results.features.length === 0) return;

          let nearestFeature = null;
          let minDistance = Infinity;

          results.features.forEach(f => {
            const dist = geometryEngine.distance(event.mapPoint, f.geometry, "meters");
            if (dist < minDistance) {
              minDistance = dist;
              nearestFeature = f;
            }
          });

          if (nearestFeature) {
            analysisLayer.removeAll();

            // 1. Draw Click Point
            analysisLayer.add(new Graphic({
              geometry: event.mapPoint,
              symbol: { type: "simple-marker", color: "#df261c", size: "12px", outline: { color: "white", width: 2 } }
            }));

            // 2. Draw Connector Line
            const line = new Polyline({
              paths: [[[event.mapPoint.x, event.mapPoint.y], [nearestFeature.geometry.centroid?.x || nearestFeature.geometry.x, nearestFeature.geometry.centroid?.y || nearestFeature.geometry.y]]],
              spatialReference: view.spatialReference
            });
            analysisLayer.add(new Graphic({
              geometry: line,
              symbol: { type: "simple-line", color: "#1e3c72", width: 2, style: "dash" }
            }));

            // 3. Highlight Nearest Feature
            analysisLayer.add(new Graphic({
              geometry: nearestFeature.geometry,
              symbol: { type: "simple-fill", color: [250, 204, 21, 0.4], outline: { color: "#facc15", width: 2 } }
            }));

            // 4. Update UI with Distance
            const formattedDist = minDistance > 1000 ? `${(minDistance/1000).toFixed(2)} km` : `${Math.round(minDistance)} m`;
            onSpatialResult(formattedDist);
          }
        } catch (err) {
          console.error("Proximity Analysis Error:", err);
        }
      });
    }

    const runAnalysis = async () => {
      try {
        if (subTool === 'Buffer Analysis') {
          const results = await layer.queryFeatures();
          const geometries = results.features.map(f => f.geometry);
          const buffers = geometryEngine.buffer(geometries, bufferDistance, bufferUnit);
          
          analysisLayer.removeAll();
          const bufferGraphics = (Array.isArray(buffers) ? buffers : [buffers]).map(geometry => ({
            geometry,
            symbol: {
              type: "simple-fill",
              color: [30, 60, 114, 0.3],
              outline: { color: [30, 60, 114, 0.8], width: 1 }
            }
          }));
          analysisLayer.addMany(bufferGraphics);
          view.goTo(analysisLayer.graphics);
        } 
        else if (subTool === 'Heatmap Density') {
          if (!layer.originalRenderer) layer.originalRenderer = layer.renderer.clone();
          layer.renderer = new HeatmapRenderer({
            colorStops: [
              { color: "rgba(30, 60, 114, 0)", ratio: 0 },
              { color: "#1e3c72", ratio: 0.2 },
              { color: "#df261c", ratio: 0.5 },
              { color: "#facc15", ratio: 0.8 },
              { color: "#ffffff", ratio: 1 }
            ],
            maxDensity: 0.01,
            minDensity: 0
          });
        }
      } catch (err) {
        console.error("Spatial Analysis Error:", err);
      }
    };

    runAnalysis();

    return () => {
      if (clickHandler) clickHandler.remove();
    };
  }, [spatialSettings?.lastRun]);

  // 8. Handle Timelapse Animation
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    // Helper to get layer by ID
    const getLayer = (id) => layersRef.current[id];

    // Cleanup logic: Clear filters on all time-enabled layers when tool is inactive
    if (!timelapseSettings) {
      layersConfig.forEach(l => {
        if (l.timeEnabled) {
          const layer = getLayer(l.id);
          if (layer) layer.definitionExpression = null;
        }
      });
      return;
    }

    const { layerId, fromYear, toYear, isPlaying, playbackInterval, startYear, endYear } = timelapseSettings;
    const activeLayerConfig = layersConfig.find(l => l.id === layerId);
    const layer = getLayer(layerId);
    
    if (!layer || !activeLayerConfig) return;

    // Ensure layer is visible
    layer.visible = true;

    // Apply temporal filter
    // Standard logic: FIELD >= FROM AND FIELD <= TO
    const timeField = activeLayerConfig.timeField || 'SURVEY_YEAR';
    layer.definitionExpression = `${timeField} >= ${fromYear} AND ${timeField} <= ${toYear}`;
    
    // Refresh to show changes
    layer.refresh();

    // Handle Animation Loop
    let intervalId = null;
    if (isPlaying) {
      // Speed could be dynamic, but defaulting to 1s for consistency
      const ms = 1000; 
      
      intervalId = setInterval(() => {
        let nextTo = toYear + 1;
        if (nextTo > endYear) {
          nextTo = startYear; // Auto-loop for smooth UX
        }
        onTimelapseYearChange(nextTo);
      }, ms);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [timelapseSettings?.isPlaying, timelapseSettings?.fromYear, timelapseSettings?.toYear, timelapseSettings?.layerId, timelapseSettings?.lastApply]);

  // 3. Handle Dynamic Basemap Switching
  useEffect(() => {
    const view = viewRef.current;
    if (view && view.map && basemap) {
      view.map.basemap = basemap;
    }
  }, [basemap]);

  // Identify Tool Logic
  const identifyGraphicsLayer = useRef(new GraphicsLayer({ id: 'identify-highlights' }));
  const sketchLayer = useRef(new GraphicsLayer({ id: 'identify-sketch-layer' }));
  const sketchVM = useRef(null);

  // Data Request Logic
  const dataRequestLayer = useRef(new GraphicsLayer({ id: 'data-request-aoi-layer' }));
  const dataRequestFinalLayer = useRef(new GraphicsLayer({ id: 'data-request-final-layer' }));
  const dataRequestSketchVM = useRef(null);

  // Sync layers with map when view changes
  useEffect(() => {
    const view = viewRef.current;
    if (view && view.map) {
      if (!view.map.findLayerById('identify-highlights')) {
        view.map.add(identifyGraphicsLayer.current);
      }
      if (!view.map.findLayerById('identify-sketch-layer')) {
        view.map.add(sketchLayer.current);
      }
      if (!view.map.findLayerById('data-request-aoi-layer')) {
        view.map.add(dataRequestLayer.current);
      }
      if (!view.map.findLayerById('data-request-final-layer')) {
        view.map.add(dataRequestFinalLayer.current);
      }
    }
  }, [is3D]); // Re-add layers if map/view changes due to 3D toggle

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    if (activeTool === 'identify') {
      console.log('Identify Active. Mode:', identifySettings.mode, 'is3D:', is3D);
      view.cursor = 'crosshair';

      const performQuery = async (geometry) => {
        console.log('Identify: performing query with', geometry.type);
        onIdentifyQueryStart();
        
        const queryLayers = identifySettings.selectedLayerId === 'all'
          ? layersConfig.filter(l => layerVisibility[l.id])
          : [layersConfig.find(l => l.id === identifySettings.selectedLayerId)];

        const results = { total: 0, grouped: {} };
        identifyGraphicsLayer.current.removeAll();
        sketchLayer.current.removeAll();

        for (const config of queryLayers) {
          const layer = layersRef.current[config.id];
          if (!layer || layer.type !== 'feature') continue;

          const query = new Query({
            geometry: geometry,
            spatialRelationship: 'intersects',
            outFields: ['*'],
            returnGeometry: true
          });

          try {
            const response = await layer.queryFeatures(query);
            if (response.features.length > 0) {
              results.total += response.features.length;
              results.grouped[config.title] = response.features.map(f => ({
                attributes: f.attributes
              }));

              response.features.forEach(f => {
                const highlightGraphic = new Graphic({
                  geometry: f.geometry,
                  symbol: f.geometry.type === 'point' ? {
                    type: 'simple-marker',
                    style: 'circle',
                    color: [255, 255, 0, 0.6],
                    size: '12px',
                    outline: { color: [255, 255, 0, 1], width: 2 }
                  } : f.geometry.type === 'polyline' ? {
                    type: 'simple-line',
                    color: [255, 255, 0, 1],
                    width: 4
                  } : {
                    type: 'simple-fill',
                    color: [255, 255, 0, 0.4],
                    outline: { color: [255, 255, 0, 1], width: 2 }
                  }
                });
                identifyGraphicsLayer.current.add(highlightGraphic);
              });
            }
          } catch (err) {
            console.error(`Identify query failed for layer ${config.title}:`, err);
          }
        }
        onIdentifyResults(results);
      };

      // Always recreate or update sketchVM for current view
      if (sketchVM.current) {
        sketchVM.current.destroy();
        sketchVM.current = null;
      }

      let clickHandler;
      if (identifySettings.mode === 'point') {
        clickHandler = view.on('click', (event) => {
          event.stopPropagation();
          performQuery(event.mapPoint);
        });
      } else {
        sketchVM.current = new SketchViewModel({
          view: view,
          layer: sketchLayer.current,
          updateOnGraphicClick: false,
          defaultCreateOptions: { hasZ: false }
        });

        sketchVM.current.on('create', async (event) => {
          if (event.state === 'start') console.log('Sketch started');
          if (event.state === 'complete') {
            console.log('Sketch complete');
            performQuery(event.graphic.geometry);
            // Re-activate sketch for next interaction
            setTimeout(() => {
              if (activeTool === 'identify' && identifySettings.mode !== 'point') {
                sketchVM.current?.create(identifySettings.mode);
              }
            }, 100);
          }
        });

        console.log('Triggering sketch create:', identifySettings.mode);
        sketchVM.current.create(identifySettings.mode);
      }

      return () => {
        if (clickHandler) clickHandler.remove();
        if (sketchVM.current) {
          sketchVM.current.cancel();
          sketchVM.current.destroy();
          sketchVM.current = null;
        }
        view.cursor = 'default';
      };
    } else {
      view.cursor = 'default';
      if (sketchVM.current) {
        sketchVM.current.cancel();
        sketchVM.current.destroy();
        sketchVM.current = null;
      }
      if (!identifySettings.results) {
        identifyGraphicsLayer.current.removeAll();
        sketchLayer.current.removeAll();
      }
    }
  }, [activeTool, identifySettings.mode, identifySettings.selectedLayerId, layerVisibility, is3D]);

  // Clear highlights when results are nullified manually
  // Data Request Logic initialization
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    if (activeTool !== 'data_request') {
      if (dataRequestSketchVM.current) dataRequestSketchVM.current.cancel();
      dataRequestLayer.current.removeAll();
      dataRequestFinalLayer.current.removeAll();
      return;
    }

    if (!dataRequestSketchVM.current) {
      dataRequestSketchVM.current = new SketchViewModel({
        view: view,
        layer: dataRequestLayer.current,
        updateOnGraphicClick: true,
        defaultCreateOptions: { hasZ: false },
        pointSymbol: { type: "simple-marker", style: "circle", color: "#df261c", size: "8px" },
        polylineSymbol: { type: "simple-line", color: "#df261c", width: 2 },
        polygonSymbol: { 
          type: "simple-fill", 
          color: [223, 38, 28, 0.1], 
          outline: { color: "#df261c", width: 2, style: "dash" } 
        }
      });

      dataRequestSketchVM.current.on(['create', 'update'], async (event) => {
        if (event.state === 'complete' || event.state === 'active') {
          const geometry = event.graphic?.geometry || event.graphics?.[0]?.geometry;
          if (geometry) {
            if (event.state === 'complete') {
              // Finalize to the permanent layer
              dataRequestLayer.current.removeAll();
              const permanentGraphic = event.graphic.clone();
              dataRequestFinalLayer.current.add(permanentGraphic);
            }

            const restrictedLayers = layersConfig.filter(l => l.restricted).map(l => ({
              id: l.id,
              title: l.title,
              intersecting: true
            }));
            onDataRequestAOIChange(geometry, restrictedLayers, event.state === 'complete');
          }
        }
      });
    }
  }, [activeTool, onDataRequestAOIChange]);

  // Trigger drawing tool only when it changes
  useEffect(() => {
    if (activeTool === 'data_request' && dataRequestDrawingTool && dataRequestSketchVM.current) {
      dataRequestFinalLayer.current.removeAll();
      dataRequestLayer.current.removeAll();
      dataRequestSketchVM.current.create(
        dataRequestDrawingTool === 'rectangle' ? 'rectangle' : 
        dataRequestDrawingTool === 'circle' ? 'circle' : 'polygon'
      );
    }
  }, [dataRequestDrawingTool]);

  useEffect(() => {
    if (!identifySettings.results) {
      identifyGraphicsLayer.current.removeAll();
      sketchLayer.current.removeAll();
    }
  }, [identifySettings.results]);

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <div 
        ref={map2DDiv} 
        id="mapViewDiv"
        style={{ 
          height: '100%', 
          width: '100%', 
          position: 'absolute',
          visibility: is3D ? 'hidden' : 'visible',
          pointerEvents: is3D ? 'none' : 'auto'
        }} 
      />
      <div 
        ref={map3DDiv} 
        id="sceneViewDiv"
        style={{ 
          height: '100%', 
          width: '100%', 
          position: 'absolute',
          visibility: is3D ? 'visible' : 'hidden',
          pointerEvents: is3D ? 'auto' : 'none'
        }} 
      />
      
      {isLoading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(8px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="loader" style={{
            border: '3px solid #f3f3f3', borderTop: '3px solid #1a2f4d',
            borderRadius: '50%', width: '32px', height: '32px', animation: 'spin 1s linear infinite',
            marginBottom: '12px'
          }}></div>
          <div style={{ fontFamily: 'Inter', fontWeight: '600', color: '#1a2f4d' }}>Synchronizing Map Views...</div>
        </div>
      )}
    </div>
  );
};

export default ArcGISMap;
