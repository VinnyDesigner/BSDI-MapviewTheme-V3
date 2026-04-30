import React, { useEffect, useRef, useState } from 'react';
import Map from '@arcgis/core/Map';
import WebMap from '@arcgis/core/WebMap';
import MapView from '@arcgis/core/views/MapView';
import SceneView from '@arcgis/core/views/SceneView';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import TileLayer from '@arcgis/core/layers/TileLayer';
import SceneLayer from '@arcgis/core/layers/SceneLayer';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import Swipe from '@arcgis/core/widgets/Swipe';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import Polyline from '@arcgis/core/geometry/Polyline';
import HeatmapRenderer from '@arcgis/core/renderers/HeatmapRenderer';
import { layersConfig } from '../layers';

// Import ArcGIS CSS
import '@arcgis/core/assets/esri/themes/light/main.css';

const ArcGISMap = ({ layerVisibility, onViewReady, isSplitMode, splitLayers, blendSettings, arcadeSettings, onArcadePreview, spatialSettings, onSpatialResult, basemap, is3D, swipeMode = 'vertical', onSwipePositionChange }) => {
  const mapDiv = useRef(null);
  const viewRef = useRef(null);
  const swipeRef = useRef(null);
  const layersRef = useRef({});
  const graphicsLayerRef = useRef(new GraphicsLayer());
  const [isLoading, setIsLoading] = useState(true);
  
  // 1. Initialize Map, View and ALL Layers
  useEffect(() => {
    if (!mapDiv.current) return;

    const map = new Map({
      basemap: basemap || 'streets-navigation-vector'
    });

    const ViewClass = is3D ? SceneView : MapView;
    const viewConfig = {
      container: mapDiv.current,
      map: map,
      center: [50.55, 26.22],
      zoom: 9,
      ui: { components: [] }
    };

    if (is3D) {
      viewConfig.camera = {
        position: {
          x: 50.55,
          y: 26.15, // Offset slightly south for better tilt view
          z: 5000   // Altitude in meters
        },
        tilt: 65,
        heading: 0
      };
    }

    const view = new ViewClass(viewConfig);
    viewRef.current = view;

    // Add 3D Buildings if in 3D mode
    if (is3D) {
      const buildingsLayer = new SceneLayer({
        url: "https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings/SceneServer",
        title: "3D Buildings",
        popupEnabled: false,
        opacity: 0.8
      });
      map.add(buildingsLayer);
    }

    // Preload layers
    layersConfig.forEach(config => {
      const LayerClass = config.type === 'tile' ? TileLayer : FeatureLayer;
      const layer = new LayerClass({
        id: config.id,
        url: config.url,
        title: config.title,
        visible: false
      });

      if (config.id.includes('historical')) {
        layer.effect = 'grayscale(1.0) brightness(0.8) contrast(1.2)';
      }

      map.add(layer);
      layersRef.current[config.id] = layer;
    });

    view.when(() => {
      setIsLoading(false);
      if (onViewReady) onViewReady(view);

      // Smooth transition for 3D
      if (is3D) {
        view.goTo({
          center: [50.55, 26.22],
          tilt: 65,
          heading: 0,
          zoom: 15 // Zoom in to see buildings
        }, {
          duration: 2000,
          easing: "ease-in-out"
        });
      }
    });

    return () => {
      if (swipeRef.current) swipeRef.current.destroy();
      view.destroy();
    };
  }, [is3D]); 

  // 2. Manage Split Visibility & Swipe Logic (Targeting LEFT/RIGHT comparison)
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
        
        // Hide others
        Object.keys(layersRef.current).forEach(id => {
          if (id !== splitLayers.left && id !== splitLayers.right) {
            layersRef.current[id].visible = false;
          }
        });

        // 2. Clear existing swipe
        if (swipeRef.current) {
          try {
            view.ui.remove(swipeRef.current);
            swipeRef.current.destroy();
          } catch (e) {}
          swipeRef.current = null;
        }

        // 3. Create fresh swipe with current mode
        const swipe = new Swipe({
          view: view,
          leadingLayers: [leftLayer],
          trailingLayers: [rightLayer],
          direction: swipeMode,   // 'vertical' or 'horizontal'
          position: 50
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
      
      Object.keys(layersRef.current).forEach(id => {
        if (layersRef.current[id]) {
          layersRef.current[id].visible = !!layerVisibility[id];
        }
      });
    }
  }, [isSplitMode, splitLayers, layerVisibility, swipeMode]);

  // 4. Manage Layer Blending
  useEffect(() => {
    const view = viewRef.current;
    if (!view || isSplitMode) return;

    if (blendSettings) {
      // 1. Hide all layers first and reset properties
      Object.keys(layersRef.current).forEach(id => {
        const layer = layersRef.current[id];
        if (layer) {
          layer.visible = false;
          layer.opacity = 1;
          layer.blendMode = 'normal';
        }
      });

      const base = layersRef.current[blendSettings.baseLayerId];
      const overlay = layersRef.current[blendSettings.overlayLayerId];

      if (base && overlay) {
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
      }
    } else {
      // Restore standard visibility and reset blending
      Object.keys(layersRef.current).forEach(id => {
        if (layersRef.current[id]) {
          layersRef.current[id].visible = !!layerVisibility[id];
          layersRef.current[id].opacity = 1;
          layersRef.current[id].blendMode = 'normal';
        }
      });
    }
  }, [blendSettings, layerVisibility, isSplitMode]);

  // 5. Manage Arcade Expressions
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !arcadeSettings?.lastApplied) return;

    const layer = layersRef.current[arcadeSettings.layerId];
    if (!layer) return;

    const { expression, applyTo } = arcadeSettings;

    try {
      if (applyTo === 'Styling') {
        // Apply Arcade to Renderer
        layer.renderer = {
          type: "simple",
          symbol: {
            type: "simple-fill",
            color: [150, 150, 150, 0.5],
            outline: { color: [255, 255, 255, 0.8], width: 1 }
          },
          visualVariables: [{
            type: "color",
            valueExpression: expression,
            stops: [
              { value: 0, color: "#f7fcf0" },
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
            haloSize: "2px",
            font: { size: 12, weight: "bold", family: "Inter" }
          }
        }];
        layer.labelsVisible = true;
      } else if (applyTo === 'Popup') {
        // Apply Arcade to Popups
        layer.popupTemplate = {
          title: "Arcade Computation",
          content: [{
            type: "text",
            text: `The computed result for this feature is: <b>{expression/custom-arcade}</b>`
          }],
          expressionInfos: [{
            name: "custom-arcade",
            title: "Result",
            expression: expression
          }]
        };
      } else if (applyTo === 'Filtering') {
        // Note: For filtering, we typically use definitionExpression which is SQL-like.
        // However, we can use it for visual variables to "hide" features (opacity = 0).
        layer.renderer = {
          type: "simple",
          symbol: layer.renderer.symbol || { type: "simple-fill", color: "blue" },
          visualVariables: [{
            type: "opacity",
            valueExpression: `if (${expression}) { return 1 } else { return 0 }`,
            stops: [{ value: 0, opacity: 0 }, { value: 1, opacity: 1 }]
          }]
        };
      }
    } catch (err) {
      console.error("Arcade Apply Error:", err);
    }
  }, [arcadeSettings?.lastApplied]);

  // 6. Live Arcade Preview
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !arcadeSettings?.expression || !onArcadePreview) {
      if (onArcadePreview && !arcadeSettings?.expression) onArcadePreview('Enter expression to see preview');
      return;
    }

    const layer = layersRef.current[arcadeSettings.layerId];
    if (!layer) return;

    // Evaluate expression on a sample feature
    const evalPreview = async () => {
      try {
        await layer.when();
        const results = await layer.queryFeatures({
          where: "1=1",
          outFields: ["*"],
          num: 1,
          returnGeometry: false
        });

        if (results.features.length > 0) {
          const feature = results.features[0];
          const attrs = feature.attributes;
          let result = "---";
          const expr = arcadeSettings.expression.trim();
          
          // Basic field substitution for preview
          if (expr.includes('$feature.')) {
            // Extract field names from $feature.field
            const matches = [...expr.matchAll(/\$feature\.(\w+)/g)];
            let tempResult = expr;
            let fieldMissing = null;

            for (const match of matches) {
              const fieldName = match[1];
              const val = attrs[fieldName] || attrs[fieldName.toUpperCase()] || attrs[fieldName.toLowerCase()];
              
              if (val === undefined) {
                fieldMissing = fieldName;
                break;
              }
              // Replace for simulation
              tempResult = tempResult.replace(`$feature.${fieldName}`, val);
            }

            if (fieldMissing) {
              result = `Error: Field "${fieldMissing}" not found in layer`;
            } else if (expr.includes('/') || expr.includes('*')) {
              // Simulated math
              try {
                // Strip return/When for simple math eval
                const mathExpr = expr.replace('return', '').replace(';', '').trim();
                const evalExpr = mathExpr.replace(/\$feature\.(\w+)/g, (m, f) => {
                  return attrs[f] || attrs[f.toUpperCase()] || attrs[f.toLowerCase()] || 0;
                });
                result = eval(evalExpr);
              } catch (e) {
                result = "Error: Invalid math expression";
              }
            } else if (matches.length > 0) {
              const f0 = matches[0][1];
              result = attrs[f0] || attrs[f0.toUpperCase()] || attrs[f0.toLowerCase()];
            }
          } else {
            result = "Expression Valid (Logic Ready)";
          }
          
          onArcadePreview(String(result), attrs);
        } else {
          onArcadePreview("No sample features found", null);
        }
      } catch (err) {
        console.error("Preview Eval Error:", err);
        onArcadePreview("Evaluation Error", null);
      }
    };

    const timer = setTimeout(evalPreview, 300);
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
    const layer = layersRef.current[layerId];
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

  // 3. Handle Dynamic Basemap Switching
  useEffect(() => {
    const view = viewRef.current;
    if (view && view.map && basemap) {
      view.map.basemap = basemap;
    }
  }, [basemap]);

  return (
    <div className="map-view-container">
      <div ref={mapDiv} style={{ width: '100%', height: '100%' }} />
      
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
