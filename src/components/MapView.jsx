import React, { useEffect, useRef, useState, useCallback } from 'react';
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
import TimeExtent from '@arcgis/core/time/TimeExtent';
import FeatureFilter from '@arcgis/core/layers/support/FeatureFilter';
import { layersConfig } from '../layers';

// Import ArcGIS CSS
import '@arcgis/core/assets/esri/themes/light/main.css';

// ─── ArcGIS Request Configuration (Local Development Proxy) ──────────────────
// Resolves CORS and 504 Gateway Timeout issues by routing requests through 
// the Vite dev server proxy.
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

if (!esriConfig.request.interceptors.some(i => i.urls === "https://gis12.smartgeoapps.com")) {
  esriConfig.request.interceptors.push({
    urls: "https://gis12.smartgeoapps.com",
    before: function(params) {
      if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        const originalUrl = params.url;
        params.url = params.url.replace("https://gis12.smartgeoapps.com", "/arcgis-proxy-gis12");
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
  onRequestData, onDataRequestAOIChange, dataRequestDrawingTool,
  dataRequestStep,
  isSplitView,
  dynamicMapServerData
}) => {
  const map2DDiv = useRef(null);
  const map3DDiv = useRef(null);
  const view2DRef = useRef(null);
  const view3DRef = useRef(null);
  const viewRef = useRef(null); 
  const swipeRef = useRef(null);
  const layersRef = useRef({});
  const layers3DRef = useRef({});
  const compareCloneRef = useRef(null);
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
      extent: {
        xmin: 50.25,
        ymin: 25.50,
        xmax: 50.90,
        ymax: 26.40,
        spatialReference: { wkid: 4326 }
      },
      ui: { components: [] },
      popupEnabled: false
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

      if (config.type === 'tile') {
        const layer = new TileLayer(commonProps);
        map.add(layer);
        layersRef.current[config.id] = layer;
        return layer.load().catch(() => null);
      } else if (config.type === 'map-image') {
        const layer = new MapImageLayer(commonProps);
        map.add(layer);
        layersRef.current[config.id] = layer;
        return layer.load().then(() => {
          if (layer.allSublayers) {
            layer.allSublayers.forEach(sub => {
              const subKey = `${config.id}_sub_${sub.id}`;
              sub.visible = !!layerVisibility[subKey];
            });
          }
        }).catch(err => {
          console.error(`[ArcGIS] 2D MapImageLayer [${config.id}] load failed:`, err.message);
          return null;
        });
      } else if (config.url && (config.url.toLowerCase().endsWith('featureserver') || config.url.toLowerCase().endsWith('featureserver/'))) {
        const cleanUrl = config.url.endsWith('/') ? config.url.slice(0, -1) : config.url;
        const layer = new FeatureLayer({
          ...commonProps,
          url: `${cleanUrl}/0`,
          popupTemplate: { title: "{*}", content: "{*}" }
        });
        map.add(layer);
        layersRef.current[config.id] = layer;
        return layer.load().catch(() => null);
      } else {
        // Standard single FeatureLayer
        const layerProps = { 
          ...commonProps, 
          url: config.url,
          popupTemplate: { title: "{*}", content: "{*}" }
        };
        if (config.renderer) {
          layerProps.renderer = config.renderer;
        }
        const layer = new FeatureLayer(layerProps);
        map.add(layer);
        layersRef.current[config.id] = layer;
        return layer.load().catch(() => null);
      }
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
      camera: { 
        position: { 
          longitude: 50.6443, 
          latitude: 26.3185, 
          z: 120 
        }, 
        tilt: 65, 
        heading: 35 
      },
      ui: { components: [] },
      popupEnabled: false
    });

    view3DRef.current = view;
    if (is3D) viewRef.current = view;

    const buildingsLayer = new SceneLayer({
      url: "https://basemaps3d.arcgis.com/arcgis/rest/services/Esri3D_Buildings_v1/SceneServer",
      title: "3D Buildings", id: "3d-buildings", opacity: 0.8
    });
    map.add(buildingsLayer);

    const ifcVillaLayer = new SceneLayer({
      url: "https://gis9.smartgeoapps.com/server/rest/services/Hosted/IFC_OldVilla_WSL2/SceneServer/layers/0",
      title: "IFC Old Villa", id: "ifc-old-villa", opacity: 1.0
    });
    map.add(ifcVillaLayer);

    const loadPromises = layersConfig.map(config => {
      if (layers3DRef.current[config.id]) return layers3DRef.current[config.id].load();

      const commonProps = {
        id: config.id, url: config.url, title: config.title, visible: false,
        elevationInfo: { mode: "relative-to-ground" }
      };

      if (config.type === 'tile') {
        const layer = new TileLayer(commonProps);
        map.add(layer);
        layers3DRef.current[config.id] = layer;
        return layer.load().catch(() => null);
      } else if (config.type === 'map-image') {
        const layer = new MapImageLayer(commonProps);
        map.add(layer);
        layers3DRef.current[config.id] = layer;
        return layer.load().then(() => {
          if (layer.allSublayers) {
            layer.allSublayers.forEach(sub => {
              const subKey = `${config.id}_sub_${sub.id}`;
              sub.visible = !!layerVisibility[subKey];
            });
          }
        }).catch(() => null);
      } else if (config.url && (config.url.toLowerCase().endsWith('featureserver') || config.url.toLowerCase().endsWith('featureserver/'))) {
        const cleanUrl = config.url.endsWith('/') ? config.url.slice(0, -1) : config.url;
        const layer = new FeatureLayer({
          ...commonProps,
          url: `${cleanUrl}/0`,
          elevationInfo: { mode: "relative-to-ground" }
        });
        map.add(layer);
        layers3DRef.current[config.id] = layer;
        return layer.load().catch(() => null);
      } else {
        const layer = new FeatureLayer(commonProps);
        map.add(layer);
        layers3DRef.current[config.id] = layer;
        return layer.load().catch(() => null);
      }
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

  // Basemap Synchronization Effect
  useEffect(() => {
    if (basemap) {
      console.log(`[ArcGIS] Syncing basemap: ${basemap}`);
      if (view2DRef.current && view2DRef.current.map) {
        view2DRef.current.map.basemap = basemap;
      }
      if (view3DRef.current && view3DRef.current.map) {
        view3DRef.current.map.basemap = basemap;
      }
    }
  }, [basemap]);

  // 4. Split / Swipe
  const swipeManagedLayersRef = useRef([]);
  const swipeOriginalsHiddenRef = useRef({});

  useEffect(() => {
    let isCancelled = false;
    const view = viewRef.current;
    if (!view || !view.map) return;

    const getOriginalVisibility = (pId, subId = null) => {
      if (subId !== null) return !!layerVisibility[`${pId}_sub_${subId}`];
      return !!layerVisibility[pId];
    };

    const syncSublayerVis = (layer, pId, subIds, hideSelection) => {
      if (layer.type === 'map-image') {
        layer.load().then(() => {
          if (!layer.allSublayers) return;
          layer.allSublayers.forEach(sub => {
             if (!sub.sublayers) {
               const isSelected = subIds === null || subIds.includes(sub.id);
               if (isSelected && hideSelection) {
                  sub.visible = false;
               } else {
                  sub.visible = getOriginalVisibility(pId, sub.id);
               }
             }
          });
        });
      } else {
         layer.visible = hideSelection ? false : getOriginalVisibility(pId);
      }
    };

    if (!isSplitMode) {
      if (swipeRef.current) {
        view.ui.remove(swipeRef.current);
        swipeRef.current.destroy();
        swipeRef.current = null;
      }
      
      // Destroy clones
      if (swipeManagedLayersRef.current.length > 0) {
        view.map.removeMany(swipeManagedLayersRef.current);
        swipeManagedLayersRef.current = [];
      }
      
      // Restore original visibility based on layerVisibility state
      Object.entries(swipeOriginalsHiddenRef.current).forEach(([pId, data]) => {
         const layer = view.map.findLayerById(pId) || (is3D ? layers3DRef.current[pId] : layersRef.current[pId]);
         if (layer) syncSublayerVis(layer, pId, data.subIds, false);
      });
      swipeOriginalsHiddenRef.current = {};

      if (view.map.basemap) {
        view.map.basemap.baseLayers.forEach(l => l.visible = true);
        view.map.basemap.referenceLayers.forEach(l => l.visible = true);
      }
      return;
    }

    const parseLayerSelection = (selectedIds) => {
      const parsed = {};
      if (!Array.isArray(selectedIds)) return parsed;
      selectedIds.forEach(id => {
        if (!id) return;
        if (id.includes('_sub_')) {
          const [pId, subIdStr] = id.split('_sub_');
          const subId = Number(subIdStr);
          if (!parsed[pId]) {
            parsed[pId] = { config: layersConfig.find(l => l.id === pId), subIds: [] };
          } else if (parsed[pId].subIds === null) {
            parsed[pId].subIds = [];
          }
          
          // Get metadata sublayers to check if this is a group
          const mapData = dynamicMapServerData?.[pId];
          const sublayers = mapData?.metadata?.layers || [];
          
          const collectLeafIds = (sId) => {
            const match = sublayers.find(s => s.id === sId);
            if (match) {
              if (match.subLayerIds && match.subLayerIds.length > 0) {
                match.subLayerIds.forEach(childId => collectLeafIds(childId));
              } else {
                if (!parsed[pId].subIds.includes(sId)) {
                  parsed[pId].subIds.push(sId);
                }
              }
            } else {
              if (!parsed[pId].subIds.includes(sId)) {
                parsed[pId].subIds.push(sId);
              }
            }
          };
          
          collectLeafIds(subId);
        } else {
          if (!parsed[id]) {
            parsed[id] = { config: layersConfig.find(l => l.id === id), subIds: null };
          } else {
            parsed[id].subIds = null;
          }
        }
      });
      return parsed;
    };

    const leftParsed = parseLayerSelection(splitLayers.left);
    const rightParsed = parseLayerSelection(splitLayers.right);

    // Merge them to find all originals we need to hide
    const allSelected = {};
    Object.entries(leftParsed).forEach(([pId, data]) => {
      if (!allSelected[pId]) allSelected[pId] = { config: data.config, subIds: data.subIds === null ? null : [...data.subIds] };
      else if (allSelected[pId].subIds !== null) {
         if (data.subIds === null) allSelected[pId].subIds = null;
         else data.subIds.forEach(s => { if (!allSelected[pId].subIds.includes(s)) allSelected[pId].subIds.push(s); });
      }
    });
    Object.entries(rightParsed).forEach(([pId, data]) => {
      if (!allSelected[pId]) allSelected[pId] = { config: data.config, subIds: data.subIds === null ? null : [...data.subIds] };
      else if (allSelected[pId].subIds !== null) {
         if (data.subIds === null) allSelected[pId].subIds = null;
         else data.subIds.forEach(s => { if (!allSelected[pId].subIds.includes(s)) allSelected[pId].subIds.push(s); });
      }
    });

    // 1. Restore anything in swipeOriginalsHiddenRef that is NO LONGER selected
    Object.entries(swipeOriginalsHiddenRef.current).forEach(([pId, data]) => {
       const layer = view.map.findLayerById(pId) || (is3D ? layers3DRef.current[pId] : layersRef.current[pId]);
       if (layer) {
         if (!allSelected[pId]) {
            syncSublayerVis(layer, pId, data.subIds, false);
         } else if (data.subIds !== null && allSelected[pId].subIds !== null) {
            // Restore only sublayers that were deselected
            const toRestore = data.subIds.filter(s => !allSelected[pId].subIds.includes(s));
            if (toRestore.length > 0) {
               layer.load().then(() => {
                 if (!layer.allSublayers) return;
                 layer.allSublayers.forEach(sub => {
                   if (!sub.sublayers && toRestore.includes(sub.id)) {
                      sub.visible = getOriginalVisibility(pId, sub.id);
                   }
                 });
               });
            }
         } else if (data.subIds === null && allSelected[pId].subIds !== null) {
            syncSublayerVis(layer, pId, null, false);
            // The subsequent hide pass will re-hide the ones that are still selected
         }
       }
    });
    swipeOriginalsHiddenRef.current = allSelected;

    // 2. Hide the selected ones in the original layers so they don't render outside the swipe area
    Object.entries(allSelected).forEach(([pId, data]) => {
      const layer = view.map.findLayerById(pId) || (is3D ? layers3DRef.current[pId] : layersRef.current[pId]);
      if (layer) syncSublayerVis(layer, pId, data.subIds, true);
    });

    // 3. Create or update clones for Swipe
    const processSide = (parsedLayers, side) => {
      const clones = [];
      Object.entries(parsedLayers).forEach(([layerId, data]) => {
        const { config, subIds } = data;
        if (!config) return;
        
        const targetId = `${layerId}_swipe_${side}`;
        let layer = view.map.findLayerById(targetId);
        
        if (!layer) {
          if (config.type === 'tile') {
            layer = new TileLayer({ id: targetId, url: config.url, title: config.title });
          } else if (config.type === 'map-image') {
            layer = new MapImageLayer({ id: targetId, url: config.url, title: config.title });
          } else {
            let layerUrl = config.url;
            if (layerUrl && (layerUrl.toLowerCase().endsWith('featureserver') || layerUrl.toLowerCase().endsWith('featureserver/'))) {
              layerUrl = layerUrl.endsWith('/') ? `${layerUrl}0` : `${layerUrl}/0`;
            }
            layer = new FeatureLayer({ id: targetId, url: layerUrl, title: config.title });
          }
          view.map.add(layer);
          swipeManagedLayersRef.current.push(layer);
        }
        
        layer.visible = true;
        
        if (layer.type === 'map-image') {
          layer.load().then(() => {
            if (!layer.allSublayers) return;
            layer.allSublayers.forEach(sub => {
              if (!sub.sublayers) {
                sub.visible = subIds === null ? true : subIds.includes(sub.id);
              } else {
                sub.visible = true; // Keep groups visible
              }
            });
          });
        }
        
        clones.push(layer);
      });
      return clones;
    };

    const leftClones = processSide(leftParsed, 'left');
    const rightClones = processSide(rightParsed, 'right');

    // Remove any clones that are no longer needed
    const neededCloneIds = [...leftClones, ...rightClones].map(l => l.id);
    const toRemove = swipeManagedLayersRef.current.filter(l => !neededCloneIds.includes(l.id));
    if (toRemove.length > 0) {
       view.map.removeMany(toRemove);
       swipeManagedLayersRef.current = swipeManagedLayersRef.current.filter(l => neededCloneIds.includes(l.id));
    }

    // 4. Update Swipe Widget with Basemaps
    const setupSwipe = async () => {
      if (isCancelled || view.destroyed || !isSplitMode) return;

      let finalLeftClones = [...leftClones];
      let finalRightClones = [...rightClones];

      try {
        const leftBm = Basemap.fromId(splitBasemaps?.left || 'streets-navigation-vector');
        const rightBm = Basemap.fromId(splitBasemaps?.right || 'satellite');
        await Promise.all([leftBm.load(), rightBm.load()]);
        
        if (isCancelled || view.destroyed || !isSplitMode) return;

        const getBMLayers = (bm, side) => {
          const layers = [...bm.baseLayers.toArray(), ...bm.referenceLayers.toArray()];
          // Give them a unique ID suffix so they don't collide if both sides use the same basemap
          layers.forEach((l, i) => {
            l.id = `swipe_bm_${side}_${l.id || i}_${Date.now()}`;
          });
          return layers;
        };

        const leftBmClones = getBMLayers(leftBm, 'left');
        const rightBmClones = getBMLayers(rightBm, 'right');

        finalLeftClones = [...leftBmClones, ...leftClones];
        finalRightClones = [...rightBmClones, ...rightClones];

        view.map.addMany(rightBmClones, 0);
        view.map.addMany(leftBmClones, 0);

        swipeManagedLayersRef.current.push(...leftBmClones, ...rightBmClones);

        if (view.map.basemap) {
          view.map.basemap.baseLayers.forEach(l => l.visible = false);
          view.map.basemap.referenceLayers.forEach(l => l.visible = false);
        }
      } catch(err) {
        console.warn("[Swipe] Error loading basemaps:", err);
      }

      if (swipeRef.current) {
        view.ui.remove(swipeRef.current);
        swipeRef.current.destroy();
        swipeRef.current = null;
      }
      
      const swipe = new Swipe({
        view: view,
        leadingLayers: finalLeftClones,
        trailingLayers: finalRightClones,
        direction: swipeMode,
        position: 50
      });
      
      view.ui.add(swipe);
      swipeRef.current = swipe;

      swipe.watch("position", (val) => {
        if (onSwipePositionChange) {
          onSwipePositionChange({
            position: val,
            viewWidth: view.width,
            viewHeight: view.height
          });
        }
      });

      if (onSwipePositionChange) {
        onSwipePositionChange({
          position: 50,
          viewWidth: view.width,
          viewHeight: view.height
        });
      }
    };

    view.when(() => setupSwipe());

    return () => {
      isCancelled = true;
    };
  }, [isSplitMode, splitLayers, splitBasemaps, swipeMode, dynamicMapServerData]);

  // 4b. Time Compare Swipe
  useEffect(() => {
    const view = viewRef.current;
    const activeLayers = is3D ? layers3DRef.current : layersRef.current;
    if (!view || !activeLayers) return;

    const layerId = timelapseSettings?.layerId;
    if (!layerId) return;

    const originalLayer = activeLayers[layerId] || view.map.findLayerById(layerId);

    if (isSplitView) {
      if (!originalLayer) {
        console.warn(`[Temporal Swipe] Original layer not found: "${layerId}"`);
        return;
      }

      // Hide other operational layers to make Swipe clean
      Object.keys(activeLayers).forEach(id => {
        if (id !== layerId) {
          try { activeLayers[id].visible = false; } catch (_) {}
        }
      });

      originalLayer.visible = true;

      // 1. Create/Get Clone Layer
      const cloneId = `${layerId}-compare-clone`;
      let cloned = view.map.findLayerById(cloneId);
      if (!cloned) {
        if (originalLayer.type === 'map-image') {
          cloned = new MapImageLayer({
            id: cloneId,
            url: originalLayer.url,
            title: `${originalLayer.title} (Compare Clone)`,
            visible: true
          });
        } else if (originalLayer.type === 'feature') {
          cloned = new FeatureLayer({
            id: cloneId,
            url: originalLayer.url,
            title: `${originalLayer.title} (Compare Clone)`,
            visible: true
          });
        }
        if (cloned) {
          view.map.add(cloned);
          compareCloneRef.current = cloned;
        }
      } else {
        cloned.visible = true;
      }

      if (!cloned) return;

      const field = timelapseSettings.timeField || 'SURVEY_YEAR';
      const fromYear = timelapseSettings.fromYear;
      const toYear = timelapseSettings.toYear;
      const timeType = timelapseSettings.timeType || 'numeric';
      const rangeType = timelapseSettings.timeRangeType || (fromYear < 3000 ? 'year' : 'date');

      let leftExpr = "";
      let rightExpr = "";

      if (rangeType === 'year') {
        if (timeType === 'date') {
          leftExpr = `${field} >= DATE '${fromYear}-01-01' AND ${field} <= DATE '${fromYear}-12-31'`;
          rightExpr = `${field} >= DATE '${toYear}-01-01' AND ${field} <= DATE '${toYear}-12-31'`;
        } else if (timeType === 'string-date') {
          leftExpr = `${field} >= '${fromYear}-01-01' AND ${field} <= '${fromYear}-12-31'`;
          rightExpr = `${field} >= '${toYear}-01-01' AND ${field} <= '${toYear}-12-31'`;
        } else {
          leftExpr = `${field} = ${fromYear}`;
          rightExpr = `${field} = ${toYear}`;
        }
      } else {
        const fromStr = new Date(fromYear).toISOString().split('T')[0];
        const toStr = new Date(toYear).toISOString().split('T')[0];
        if (timeType === 'date') {
          leftExpr = `${field} = DATE '${fromStr}'`;
          rightExpr = `${field} = DATE '${toStr}'`;
        } else if (timeType === 'string-date') {
          leftExpr = `${field} = '${fromStr}'`;
          rightExpr = `${field} = '${toStr}'`;
        } else {
          const fromYr = new Date(fromYear).getFullYear();
          const toYr = new Date(toYear).getFullYear();
          leftExpr = `${field} = ${fromYr}`;
          rightExpr = `${field} = ${toYr}`;
        }
      }

      console.log(`[Temporal Swipe] Applying Left: "${leftExpr}" & Right: "${rightExpr}"`);

      // Apply leftExpr to original layer
      if (originalLayer.type === 'map-image') {
        const leftDefs = {};
        const applyLeft = () => {
          if (originalLayer.allSublayers && originalLayer.allSublayers.length > 0) {
            originalLayer.allSublayers.forEach(sub => {
              const isGroup = sub.sublayers && sub.sublayers.length > 0;
              if (!isGroup) {
                sub.visible = true;
                sub.definitionExpression = leftExpr;
                leftDefs[sub.id] = leftExpr;
              }
            });
          } else {
            leftDefs[0] = leftExpr;
          }
          originalLayer.customParameters = {
            ...(originalLayer.customParameters || {}),
            layerDefs: JSON.stringify(leftDefs)
          };
          if (originalLayer.sublayers) {
            try { originalLayer.sublayers = originalLayer.sublayers.toArray(); } catch (_) {}
          }
          if (typeof originalLayer.refresh === 'function') originalLayer.refresh();
        };

        if (originalLayer.loaded) applyLeft();
        else originalLayer.load().then(applyLeft).catch(() => {});

      } else if (originalLayer.type === 'feature') {
        originalLayer.definitionExpression = leftExpr;
      }

      // Apply rightExpr to cloned layer
      if (cloned.type === 'map-image') {
        const rightDefs = {};
        const applyRight = () => {
          if (cloned.allSublayers && cloned.allSublayers.length > 0) {
            cloned.allSublayers.forEach(sub => {
              const isGroup = sub.sublayers && sub.sublayers.length > 0;
              if (!isGroup) {
                sub.visible = true;
                sub.definitionExpression = rightExpr;
                rightDefs[sub.id] = rightExpr;
              }
            });
          } else {
            rightDefs[0] = rightExpr;
          }
          cloned.customParameters = {
            ...(cloned.customParameters || {}),
            layerDefs: JSON.stringify(rightDefs)
          };
          if (cloned.sublayers) {
            try { cloned.sublayers = cloned.sublayers.toArray(); } catch (_) {}
          }
          if (typeof cloned.refresh === 'function') cloned.refresh();
        };

        if (cloned.loaded) applyRight();
        else cloned.load().then(applyRight).catch(() => {});

      } else if (cloned.type === 'feature') {
        cloned.definitionExpression = rightExpr;
      }

      // Recreate Swipe widget
        view.when(() => {
          if (view.destroyed || !isSplitView) return;
          if (swipeRef.current) {
            view.ui.remove(swipeRef.current);
            try { swipeRef.current.destroy(); } catch (_) {}
            swipeRef.current = null;
          }

          const delay = window.innerWidth <= 768 ? 400 : 0;
          setTimeout(() => {
            if (view.destroyed || !isSplitView) return;
            const swipe = new Swipe({
              view: view,
              leadingLayers: [originalLayer],
              trailingLayers: [cloned],
              direction: swipeMode,
              position: 50
            });
            view.ui.add(swipe);
            swipeRef.current = swipe;

            swipe.watch("position", (val) => {
              if (onSwipePositionChange) {
                onSwipePositionChange({
                  position: val,
                  viewWidth: view.width,
                  viewHeight: view.height
                });
              }
            });

            if (onSwipePositionChange) {
              onSwipePositionChange({
                position: 50,
                viewWidth: view.width,
                viewHeight: view.height
              });
            }
            view.resize();
          }, delay);
        });

    } else {
      // Clean up Swipe and comparison clones
      if (swipeRef.current && !isSplitMode) {
        view.ui.remove(swipeRef.current);
        try { swipeRef.current.destroy(); } catch (_) {}
        swipeRef.current = null;
      }

      if (compareCloneRef.current) {
        view.map.remove(compareCloneRef.current);
        try { compareCloneRef.current.destroy(); } catch (_) {}
        compareCloneRef.current = null;
      }

      // Restore layers based on normal temporal filter settings
      if (originalLayer) {
        if (timelapseSettings?.lastApply > 0) {
          applyTemporalFilterNow(timelapseSettings, view, activeLayers);
        } else {
          clearAllTemporalFilters(activeLayers, view);
        }
      }
    }
  }, [isSplitView, timelapseSettings?.fromYear, timelapseSettings?.toYear, timelapseSettings?.layerId, timelapseSettings?.timeField, swipeMode, is3D]);

  // ============================================================
  // BLEND TOOL FUNCTIONALITY (ACTUAL GIS LAYER BLENDING)
  // ============================================================
  const prevOverlayLayerIdRef = useRef(null);
  const originalBlendStatesRef = useRef({});

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !view.map) return;

    // Helper to restore a specific layer's original state
    const restoreLayer = (id) => {
      const state = originalBlendStatesRef.current[id];
      if (state) {
        let layer = view.map.findLayerById(state.parentId || id);
        if (layer) {
          layer.blendMode = state.blendMode;
          layer.opacity = state.opacity;
        }
        delete originalBlendStatesRef.current[id];
      }
    };

    // 1. Cleanup when tool is deactivated
    if (activeTool !== 'blend') {
       Object.keys(originalBlendStatesRef.current).forEach(id => restoreLayer(id));
       prevOverlayLayerIdRef.current = null;
       return;
    }

    const { overlayLayerId, blendMode, opacity, baseLayerId } = blendSettings;
    
    console.log(`[Blend] Basemap applied: ${baseLayerId || basemap}`);

    // 2. If overlay layer changed, restore the old one
    if (prevOverlayLayerIdRef.current && prevOverlayLayerIdRef.current !== overlayLayerId) {
      restoreLayer(prevOverlayLayerIdRef.current);
    }
    prevOverlayLayerIdRef.current = overlayLayerId;

    // 3. Apply blend to selected overlay layer
    if (overlayLayerId) {
      console.log(`[Blend] Selected overlay layer: ${overlayLayerId}`);
      console.log(`[Blend] Blend mode: ${blendMode}`);
      console.log(`[Blend] Opacity: ${opacity}`);

      let targetLayer = null;
      let parentLayer = null;

      // Handle sublayers from MapImageLayer
      if (overlayLayerId.includes('_sub_')) {
        const [pId, subIdRaw] = overlayLayerId.split('_sub_');
        parentLayer = view.map.findLayerById(pId);
        if (parentLayer) {
           targetLayer = parentLayer; // blendMode applies to the parent MapImageLayer
           parentLayer.visible = true; // Ensure parent is visible
           
           const subId = Number(subIdRaw);
           const sub = typeof parentLayer.findSublayerById === 'function' 
                        ? parentLayer.findSublayerById(subId) 
                        : (parentLayer.sublayers ? parentLayer.sublayers.find(s => s.id === subId || s.id === subIdRaw) : null);
           
           if (sub) sub.visible = true; // Ensure sublayer is visible
        }
      } else {
        targetLayer = view.map.findLayerById(overlayLayerId);
        if (targetLayer) {
          targetLayer.visible = true;
        }
      }

      if (targetLayer) {
        // Save original state if we haven't modified this layer yet
        if (!originalBlendStatesRef.current[overlayLayerId]) {
           originalBlendStatesRef.current[overlayLayerId] = {
             parentId: parentLayer ? parentLayer.id : null,
             blendMode: targetLayer.blendMode || 'normal',
             opacity: targetLayer.opacity !== undefined ? targetLayer.opacity : 1
           };
        }

        // Apply new blend settings dynamically
        targetLayer.blendMode = blendMode || 'normal';
        targetLayer.opacity = opacity !== undefined ? opacity : 1;

        // Bring the overlay layer to the very top so it renders above the basemap and other layers
        view.map.reorder(targetLayer, view.map.layers.length - 1);
        
        if (view.requestRender) view.requestRender();
      } else {
        console.warn(`[Blend] Overlay layer '${overlayLayerId}' not found on the map.`);
      }
    } else {
      // If no overlay is selected (e.g. after Reset button is clicked), restore all affected layers
      Object.keys(originalBlendStatesRef.current).forEach(id => restoreLayer(id));
    }
  }, [blendSettings, activeTool, basemap]);

  // ============================================================
  // TEMPORAL FILTER ENGINE — True ArcGIS Time-Slider Behavior
  //
  // Strategy order for MapImageLayer (server-rendered):
  //   1. customParameters.layerDefs  → URL-level, bypasses all cache
  //   2. sublayer.definitionExpression → ArcGIS client tracking
  //   3. layer.refresh()              → forces a new server request
  //   4. view.timeExtent              → for time-aware services
  //
  // Strategy for FeatureLayer (client-rendered):
  //   1. layer.definitionExpression   → hides non-matching features
  //   2. LayerView.filter             → instant client-side removal
  // ============================================================
  const layerViewCacheRef = useRef({});

  const applyTemporalFilterNow = useCallback(async (settings, viewInstance, activeLayers) => {
    if (!settings?.layerId || !viewInstance) return;

    const { layerId, fromYear, toYear, timeField, timeType, timeRangeType } = settings;
    const selectedYear = toYear; // properly bind selectedYear to the timelineValue
    const field = timeField || 'SURVEY_YEAR';
    
    const rangeType = timeRangeType || (fromYear < 3000 ? 'year' : 'date');

    // Construct filter expression based on type and range type
    let expression = "";
    if (rangeType === 'year') {
      if (timeType === 'date') {
        expression = `${field} >= DATE '${fromYear}-01-01' AND ${field} <= DATE '${toYear}-12-31'`;
      } else if (timeType === 'string-date') {
        expression = `${field} >= '${fromYear}-01-01' AND ${field} <= '${toYear}-12-31'`;
      } else {
        expression = `${field} >= ${fromYear} AND ${field} <= ${toYear}`;
      }
    } else {
      const fromStr = new Date(fromYear).toISOString().split('T')[0];
      const toStr = new Date(toYear).toISOString().split('T')[0];
      if (timeType === 'date') {
        expression = `${field} >= DATE '${fromStr}' AND ${field} <= DATE '${toStr}'`;
      } else if (timeType === 'string-date') {
        expression = `${field} >= '${fromStr}' AND ${field} <= '${toStr}'`;
      } else {
        const fromYr = new Date(fromYear).getFullYear();
        const toYr = new Date(toYear).getFullYear();
        expression = `${field} >= ${fromYr} AND ${field} <= ${toYr}`;
      }
    }

    console.log(`[Temporal Filter] Applying expression: "${expression}" on "${layerId}", selectedYear: ${selectedYear}`);

    // 1. Set view.timeExtent for time-aware services if applicable
    try {
      let startDate, endDate;
      if (rangeType === 'year') {
        startDate = new Date(`${fromYear}-01-01T00:00:00Z`);
        endDate = new Date(`${toYear}-12-31T23:59:59Z`);
      } else {
        startDate = new Date(fromYear);
        endDate = new Date(toYear);
      }
      viewInstance.timeExtent = new TimeExtent({ start: startDate, end: endDate });
    } catch (e) {
      console.warn('[Temporal] view.timeExtent assignment bypassed:', e.message);
    }

    // 2. Apply definition expression / filter
    if (layerId.includes('_sub_')) {
      const [parentId, subId] = layerId.split('_sub_');
      const parentLayer = activeLayers[parentId] || viewInstance.map.findLayerById(parentId);
      if (parentLayer && parentLayer.type === 'map-image') {
        parentLayer.visible = true;
        const doApply = () => {
          const sublayer = parentLayer.findSublayerById(Number(subId));
          if (sublayer) {
            sublayer.visible = true;
            sublayer.definitionExpression = expression;
          }
          
          const layerDefs = {};
          layerDefs[subId] = expression;
          parentLayer.customParameters = {
            ...(parentLayer.customParameters || {}),
            layerDefs: JSON.stringify(layerDefs)
          };

          if (parentLayer.sublayers) {
            try { parentLayer.sublayers = parentLayer.sublayers.toArray(); } catch (_) {}
          }
          if (typeof parentLayer.refresh === 'function') parentLayer.refresh();
        };

        if (parentLayer.loaded) doApply();
        else parentLayer.load().then(doApply).catch(() => {});
      }
    } else {
      // FeatureLayer, GeoJSONLayer, CSVLayer
      const baseId = layerId.includes('_sub_') ? layerId.split('_sub_')[0] : layerId;
      const targetLayer = activeLayers[baseId] || 
                          viewInstance.map.findLayerById(baseId) ||
                          activeLayers[layerId] || 
                          viewInstance.map.findLayerById(layerId);
      if (!targetLayer) {
        console.warn(`[Temporal] Layer not found: "${layerId}" (base: "${baseId}")`);
        return;
      }
      targetLayer.visible = true;

      // Debugging: Inspect actual feature attributes to inspect matching field values
      targetLayer.queryFeatures({
        where: "1=1",
        outFields: ["*"],
        returnGeometry: false
      }).then((res) => {
        if (res && res.features && res.features[0]) {
          console.log('[Temporal Debug] Sample Feature Attributes:', res.features[0].attributes);
        }
      }).catch(err => {
        console.warn('[Temporal Debug] Query features failed:', err.message);
      });

      // Apply definitionExpression directly to the FeatureLayer for solid server-side rendering
      targetLayer.definitionExpression = expression;

      // Also apply layerView.filter for instant client-side updates
      viewInstance.whenLayerView(targetLayer).then((layerView) => {
        if (layerView) {
          layerView.filter = {
            where: expression
          };
          if (typeof layerView.refresh === 'function') {
            layerView.refresh();
          }
        }
      }).catch(err => {
        console.warn('[Temporal] LayerView.filter assignment failed:', err.message);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearAllTemporalFilters = useCallback((activeLayers, viewInstance) => {
    if (!viewInstance) return;

    // Clear view.timeExtent
    try { viewInstance.timeExtent = null; } catch (_) {}

    // Clear all potential definitionExpressions and filter criteria
    viewInstance.map.allLayers.forEach(layer => {
      if (layer.type === 'feature' || layer.type === 'geojson' || layer.type === 'csv') {
        layer.definitionExpression = null; // Clear definitionExpression
        viewInstance.whenLayerView(layer).then(lv => {
          if (lv) {
            lv.filter = null;
            if (typeof lv.refresh === 'function') lv.refresh();
          }
        }).catch(() => {});
      } else if (layer.type === 'map-image') {
        if (layer.customParameters && layer.customParameters.layerDefs) {
          const params = { ...layer.customParameters };
          delete params.layerDefs;
          layer.customParameters = Object.keys(params).length ? params : undefined;
        }
        if (layer.allSublayers) {
          layer.allSublayers.forEach(sub => { sub.definitionExpression = null; });
        }
        if (layer.sublayers) { try { layer.sublayers = layer.sublayers.toArray(); } catch (_) {} }
        if (typeof layer.refresh === 'function') layer.refresh();
      }
    });

    console.log('[Temporal] 🧹 All temporal filters cleared');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Main Effect: fires on lastApply change (Apply button OR playback tick)
  useEffect(() => {
    if (isSplitView) return; // Prevent conflicts during Swipe Compare
    const view = viewRef.current;
    const activeLayers = is3D ? layers3DRef.current : layersRef.current;
    if (!view || !activeLayers) return;

    if (!timelapseSettings?.layerId || !timelapseSettings?.lastApply) {
      clearAllTemporalFilters(activeLayers, view);
      return;
    }

    applyTemporalFilterNow(timelapseSettings, view, activeLayers);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelapseSettings?.lastApply, timelapseSettings?.layerId, is3D, isSplitView]);


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

      // Sync custom/dynamic layers added to the map directly (e.g. from Add Data or spatial analysis)
      currentView.map.layers.forEach(layer => {
        if (layer && layer.id && !activeLayers[layer.id]) {
          if (layerVisibility[layer.id] !== undefined) {
            const isVisible = !!layerVisibility[layer.id];
            if (layer.visible !== isVisible) {
              layer.visible = isVisible;
            }
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


  // ── Spatial Analysis Engine ──────────────────────────────────────────────
  const spatialGraphicsLayer = useRef(new GraphicsLayer({ id: 'spatial-analysis-layer' }));
  
  useEffect(() => {
    const view = viewRef.current;
    if (!view || activeTool !== 'spatial_analysis') {
      if (spatialGraphicsLayer.current) spatialGraphicsLayer.current.removeAll();
      return;
    }

    if (!view.map.findLayerById('spatial-analysis-layer')) {
      view.map.add(spatialGraphicsLayer.current);
    }
  }, [activeTool]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !spatialSettings?.lastRun || activeTool !== 'spatial_analysis') return;

    const runAnalysis = async () => {
      const { subTool, layerId, bufferDistance, bufferUnit, lastRun } = spatialSettings;
      if (!layerId || !lastRun) return;

      try {
        const unitMap = { 'meters': 'meters', 'kilometers': 'kilometers', 'miles': 'miles' };

        const getGeometryExtent = (geom) => {
          if (!geom) return null;
          if (geom.extent) return geom.extent;
          if (geom.type === 'point') {
            return {
              xmin: geom.x, ymin: geom.y,
              xmax: geom.x, ymax: geom.y,
              spatialReference: geom.spatialReference || view.spatialReference
            };
          }
          return null;
        };

        const unionExtents = (extent1, extent2) => {
          if (!extent1) return extent2 ? (extent2.clone ? extent2.clone() : { ...extent2 }) : null;
          if (!extent2) return extent1 ? (extent1.clone ? extent1.clone() : { ...extent1 }) : null;
          
          if (typeof extent1.union === 'function') {
            try {
              return extent1.union(extent2);
            } catch (_) {}
          }
          
          return {
            xmin: Math.min(extent1.xmin, extent2.xmin),
            ymin: Math.min(extent1.ymin, extent2.ymin),
            xmax: Math.max(extent1.xmax, extent2.xmax),
            ymax: Math.max(extent1.ymax, extent2.ymax),
            spatialReference: extent1.spatialReference || extent2.spatialReference
          };
        };

        const resolveLayer = async (lId) => {
          if (!lId) return null;
          let tLayer;
          let tTitle = "Result";
          if (lId.includes('_sub_')) {
            const [parentId, subId] = lId.split('_sub_');
            const parent = view.map.findLayerById(parentId);
            if (parent && parent.type === 'map-image') {
              const sub = parent.allSublayers?.find(s => s.id === parseInt(subId));
              tTitle = sub ? sub.title : tTitle;
              tLayer = new FeatureLayer({ url: `${parent.url}/${subId}` });
              await tLayer.load();
            }
          } else {
            tLayer = view.map.findLayerById(lId);
            if (tLayer) tTitle = tLayer.title || tTitle;
          }
          return { layer: tLayer, title: tTitle };
        };

        const targetInfo = await resolveLayer(layerId);
        if (!targetInfo || !targetInfo.layer) {
          console.warn('Spatial Analysis: Target layer not found', layerId);
          return;
        }
        const targetLayer = targetInfo.layer;
        const title = targetInfo.title;

        let secondaryLayer = null;
        let secondaryTitle = "";
        if (['Select by Location', 'Overlay (Intersect)'].includes(subTool)) {
          const secInfo = await resolveLayer(spatialSettings.secondaryLayerId);
          if (!secInfo || !secInfo.layer) {
            console.warn('Spatial Analysis: Secondary layer required but not found');
            return;
          }
          secondaryLayer = secInfo.layer;
          secondaryTitle = secInfo.title;
        }

        if (subTool === 'Buffer Analysis') {
          const query = targetLayer.createQuery();
          query.where = '1=1';
          query.outSpatialReference = view.spatialReference;
          query.returnGeometry = true;
          query.num = 200; // Limit for performance
          
          const results = await targetLayer.queryFeatures(query);
          const features = results.features;
          if (features.length === 0) return;

          const geometries = features.map(f => f.geometry);
          const unit = unitMap[bufferUnit] || 'meters';
          
          const bufferedGeometries = geometryEngine.buffer(geometries, bufferDistance, unit);
          
          let fullExtent = null;
          const fillSymbol = { type: "simple-fill", color: [38, 143, 255, 0.4], outline: { color: [38, 143, 255, 1], width: 2, style: "dash" } };

          bufferedGeometries.forEach((geom) => {
            if (!geom) return;
            const graphic = new Graphic({
              geometry: geom, symbol: fillSymbol,
              attributes: { title: `${bufferDistance} ${unit} Buffer`, runId: lastRun }
            });
            spatialGraphicsLayer.current.add(graphic);
            const geomExtent = getGeometryExtent(geom);
            if (geomExtent) {
              fullExtent = unionExtents(fullExtent, geomExtent);
            }
          });

          if (fullExtent) {
            const ext = fullExtent.expand ? fullExtent.expand(1.2) : fullExtent;
            console.log("Extent:", ext);
            console.log("Spatial Reference:", ext.spatialReference);
            console.log("Scale:", view.scale);
            view.goTo({ target: ext });
          }
          if (typeof onSpatialResult === 'function') {
             onSpatialResult({ id: lastRun, title: `${title} - Buffer`, count: features.length, distance: bufferDistance, unit: unit });
          }
        } 
        else if (subTool === 'Select by Location' || subTool === 'Overlay (Intersect)') {
          const secQuery = secondaryLayer.createQuery();
          secQuery.where = '1=1';
          secQuery.returnGeometry = true;
          secQuery.outSpatialReference = view.spatialReference;
          const secResults = await secondaryLayer.queryFeatures(secQuery);
          if (!secResults || secResults.features.length === 0) return;
          
          const secGeometries = secResults.features.map(f => f.geometry).filter(Boolean);
          if (secGeometries.length === 0) return;
          
          let unionedSecGeometry = secGeometries[0];
          if (secGeometries.length > 1) {
            unionedSecGeometry = geometryEngine.union(secGeometries);
          }
          
          if (!unionedSecGeometry) return;

          const tQuery = targetLayer.createQuery();
          tQuery.where = '1=1';
          tQuery.returnGeometry = true;
          tQuery.outSpatialReference = view.spatialReference;
          
          // For Select by Location, we can do the heavy lifting on the server if supported
          if (subTool === 'Select by Location') {
             tQuery.geometry = unionedSecGeometry;
             tQuery.spatialRelationship = 'intersects';
          }
          
          const tResults = await targetLayer.queryFeatures(tQuery);
          if (!tResults || tResults.features.length === 0) {
            if (typeof onSpatialResult === 'function') {
               onSpatialResult({ id: lastRun, title: `${title} x ${secondaryTitle} (No Match)`, count: 0 });
            }
            return;
          }

          let fullExtent = null;
          let resultCount = 0;
          const color = subTool === 'Select by Location' ? [255, 193, 7] : [40, 167, 69];
          const fillSymbol = { type: "simple-fill", color: [color[0], color[1], color[2], 0.4], outline: { color: [color[0], color[1], color[2], 1], width: 2 } };
          const pointSymbol = { type: "simple-marker", color: [color[0], color[1], color[2], 0.8], size: 8, outline: { color: [color[0], color[1], color[2], 1], width: 1 } };
          const lineSymbol = { type: "simple-line", color: [color[0], color[1], color[2], 1], width: 3 };

          tResults.features.forEach(f => {
            if (!f.geometry) return;
            let resultGeom = null;
            if (subTool === 'Select by Location') {
              resultGeom = f.geometry; // Already filtered by server
            } else {
              resultGeom = geometryEngine.intersect(f.geometry, unionedSecGeometry);
            }

            if (resultGeom) {
               resultCount++;
               let symbol = fillSymbol;
               if (resultGeom.type === 'point' || resultGeom.type === 'multipoint') symbol = pointSymbol;
               else if (resultGeom.type === 'polyline') symbol = lineSymbol;
               
               const graphic = new Graphic({
                 geometry: resultGeom, symbol: symbol,
                 attributes: { ...f.attributes, title: `${subTool} Result`, runId: lastRun }
               });
               spatialGraphicsLayer.current.add(graphic);
               
               const geomExtent = getGeometryExtent(resultGeom);
               if (geomExtent) {
                 fullExtent = unionExtents(fullExtent, geomExtent);
               }
            }
          });

          if (resultCount > 0) {
            if (fullExtent) {
              const ext = fullExtent.expand ? fullExtent.expand(1.2) : fullExtent;
              console.log("Extent:", ext);
              console.log("Spatial Reference:", ext.spatialReference);
              console.log("Scale:", view.scale);
              view.goTo({ target: ext });
            }
            if (typeof onSpatialResult === 'function') {
               onSpatialResult({ id: lastRun, title: `${title} x ${secondaryTitle}`, count: resultCount });
            }
          } else {
            if (typeof onSpatialResult === 'function') {
               onSpatialResult({ id: lastRun, title: `${title} x ${secondaryTitle} (No Overlap)`, count: 0 });
            }
          }
        }
        else if (subTool === 'Heatmap Density') {
          const query = targetLayer.createQuery();
          query.where = '1=1';
          query.outSpatialReference = view.spatialReference;
          query.returnGeometry = true;
          const results = await targetLayer.queryFeatures(query);
          const features = results.features;
          if (features.length === 0) return;

          // Only points make sense for heatmaps
          const pointFeatures = features.filter(f => f.geometry && (f.geometry.type === 'point' || f.geometry.type === 'multipoint'));
          if (pointFeatures.length === 0) {
            console.warn("Heatmap requires point features.");
            return;
          }

          // Add invisible graphics so export works
          pointFeatures.forEach(f => {
             const graphic = new Graphic({
               geometry: f.geometry,
               symbol: { type: "simple-marker", color: [0,0,0,0], outline: { width: 0 } },
               attributes: { ...f.attributes, title: `Heatmap Point`, runId: lastRun }
             });
             graphic.visible = false;
             spatialGraphicsLayer.current.add(graphic);
          });

          // Create actual FeatureLayer for heatmap renderer
          const heatmapRenderer = {
            type: "heatmap",
            colorStops: [
              { color: "rgba(63, 40, 102, 0)", ratio: 0 },
              { color: "#472b77", ratio: 0.083 },
              { color: "#4e2d87", ratio: 0.166 },
              { color: "#563098", ratio: 0.25 },
              { color: "#5d32a8", ratio: 0.333 },
              { color: "#6735be", ratio: 0.416 },
              { color: "#7139d4", ratio: 0.5 },
              { color: "#7b3ce9", ratio: 0.583 },
              { color: "#853fff", ratio: 0.666 },
              { color: "#a46fbf", ratio: 0.75 },
              { color: "#c29f80", ratio: 0.833 },
              { color: "#e0cf40", ratio: 0.916 },
              { color: "#ffff00", ratio: 1 }
            ],
            maxPixelIntensity: 100,
            minPixelIntensity: 0
          };

          const heatmapLayer = new FeatureLayer({
            id: `heatmap-${lastRun}`,
            title: `Heatmap: ${title}`,
            source: pointFeatures.map((f, i) => new Graphic({ geometry: f.geometry, attributes: { ObjectID: i } })),
            objectIdField: "ObjectID",
            geometryType: "point",
            spatialReference: view.spatialReference,
            fields: [{ name: "ObjectID", alias: "ObjectID", type: "oid" }],
            renderer: heatmapRenderer
          });

          view.map.add(heatmapLayer);
          
          let fullExtent = null;
          if (pointFeatures.length > 0) {
            const xs = pointFeatures.map(f => f.geometry.x).filter(x => typeof x === 'number');
            const ys = pointFeatures.map(f => f.geometry.y).filter(y => typeof y === 'number');
            if (xs.length > 0 && ys.length > 0) {
              fullExtent = {
                xmin: Math.min(...xs), ymin: Math.min(...ys),
                xmax: Math.max(...xs), ymax: Math.max(...ys),
                spatialReference: view.spatialReference
              };
              console.log("Extent:", fullExtent);
              console.log("Spatial Reference:", fullExtent.spatialReference);
              console.log("Scale:", view.scale);
              view.goTo({ target: fullExtent });
            }
          }

          if (typeof onSpatialResult === 'function') {
             onSpatialResult({ id: lastRun, title: `${title} - Heatmap`, count: pointFeatures.length });
          }
        }
        else if (subTool === 'Proximity (Nearest)') {
           view.cursor = 'crosshair';
           view.once('click', async (event) => {
             view.cursor = 'default';
             const clickGeom = event.mapPoint;

             const query = targetLayer.createQuery();
             query.where = '1=1';
             query.returnGeometry = true;
             query.outSpatialReference = view.spatialReference;
             const results = await targetLayer.queryFeatures(query);
             const features = results.features;
             if (features.length === 0) return;

             let nearestDist = Infinity;
             let nearestFeature = null;

             features.forEach(f => {
               if (!f.geometry) return;
               const dist = geometryEngine.distance(clickGeom, f.geometry, "meters");
               if (dist < nearestDist) {
                 nearestDist = dist;
                 nearestFeature = f;
               }
             });

             if (nearestFeature) {
               const centerX = nearestFeature.geometry.extent ? nearestFeature.geometry.extent.center.x : (nearestFeature.geometry.x || nearestFeature.geometry.longitude);
               const centerY = nearestFeature.geometry.extent ? nearestFeature.geometry.extent.center.y : (nearestFeature.geometry.y || nearestFeature.geometry.latitude);
               const lineGeom = {
                 type: "polyline",
                 paths: [[[clickGeom.x, clickGeom.y], [centerX, centerY]]],
                 spatialReference: view.spatialReference
               };

               const lineGraphic = new Graphic({
                 geometry: lineGeom,
                 symbol: { type: "simple-line", color: [220, 53, 69, 1], width: 2, style: "dash" },
                 attributes: { title: "Distance Line", runId: lastRun }
               });

               const featureGraphic = new Graphic({
                 geometry: nearestFeature.geometry,
                 symbol: { type: "simple-fill", color: [220, 53, 69, 0.4], outline: { color: [220, 53, 69, 1], width: 2 } },
                 attributes: { ...nearestFeature.attributes, title: `Nearest Feature`, runId: lastRun }
               });
               
               if (nearestFeature.geometry.type === 'point' || nearestFeature.geometry.type === 'multipoint') {
                 featureGraphic.symbol = { type: "simple-marker", color: [220, 53, 69, 0.8], size: 10, outline: { color: [220, 53, 69, 1], width: 1 } };
               } else if (nearestFeature.geometry.type === 'polyline') {
                 featureGraphic.symbol = { type: "simple-line", color: [220, 53, 69, 1], width: 3 };
               }

               spatialGraphicsLayer.current.addMany([lineGraphic, featureGraphic]);
               view.goTo([featureGraphic, lineGraphic]);

               if (typeof onSpatialResult === 'function') {
                  onSpatialResult({ id: lastRun, title: `${title} - Nearest`, count: 1, distanceResult: `${nearestDist.toFixed(2)} m` });
               }
             }
           });
        }
      } catch (err) {
        console.error('Spatial Analysis run error:', err);
      }
    };
    
    runAnalysis();
  }, [spatialSettings?.lastRun]);


  // Identify Logic
  const identifyGraphicsLayer = useRef(new GraphicsLayer({ id: 'identify-highlights' }));
  const sketchLayer = useRef(new GraphicsLayer({ id: 'identify-sketch-layer' }));
  const sketchVM = useRef(null);
  const latestIdentifySettings = useRef(identifySettings);
  const performQueryRef = useRef(null);

  useEffect(() => {
    latestIdentifySettings.current = identifySettings;
  }, [identifySettings]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || activeTool !== 'identify') {
      if (sketchVM.current) sketchVM.current.cancel();
      return;
    }
    
    view.cursor = 'crosshair';

    // Ensure graphics layers are added to the map
    if (!view.map.findLayerById('identify-highlights')) {
      view.map.add(identifyGraphicsLayer.current);
    }
    if (!view.map.findLayerById('identify-sketch-layer')) {
      view.map.add(sketchLayer.current);
    }

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
          if (performQueryRef.current) {
            performQueryRef.current(geometry);
          }
          sketchLayer.current.removeAll();
          // Keep tool active
          const currentSettings = latestIdentifySettings.current;
          if (currentSettings.mode === 'rectangle') sketchVM.current.create('rectangle');
          if (currentSettings.mode === 'polygon') sketchVM.current.create('polygon');
        }
      });
    } else {
      sketchVM.current.view = view;
    }

    const performQuery = async (geometry) => {
      onIdentifyQueryStart();
      const results = { total: 0, grouped: {} };
      identifyGraphicsLayer.current.removeAll();

      // ── 1. Build list of configured service layers to query ──────────
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
          if (identifySettings.selectedLayerId === config.id && layer.type === 'feature') {
            layersToQuery.push({ layer, title: config.title, config });
          } else if (layer.type === 'map-image' && identifySettings.selectedLayerId.startsWith(config.id)) {
            const subIdMatch = identifySettings.selectedLayerId.match(/_sub_(\d+)$/);
            if (subIdMatch) {
              const subId = parseInt(subIdMatch[1]);
              const sub = layer.allSublayers.find(s => s.id === subId);
              if (sub) layersToQuery.push({ layer: sub, title: sub.title, config, parentId: config.id });
            }
          }
        }
      });

      // ── 2. Scan for uploaded client-side layers ───────────────────────
      // System layers that should never be queried
      const SYSTEM_IDS = new Set([
        'identify-highlights', 'identify-sketch-layer',
        'data-request-aoi-layer', 'data-request-final-layer',
        'graphics-layer-draw', 'graphicsLayer'
      ]);
      const uploadedGraphicsLayers = []; // GraphicsLayer (Excel) — queried with geometryEngine

      view.map.allLayers.forEach(layer => {
        if (SYSTEM_IDS.has(layer.id)) return;
        if (!layer.id?.startsWith('uploaded-') && !layer.id?.startsWith('project-cad-')) return;

        // Respect visibility
        const isVisible = Object.prototype.hasOwnProperty.call(layerVisibility, layer.id)
          ? layerVisibility[layer.id]
          : layer.visible;
        if (!isVisible) return;

        const queryAll = identifySettings.selectedLayerId === 'all';
        const isTargeted = identifySettings.selectedLayerId === layer.id;
        if (!queryAll && !isTargeted) return;

        if (layer.type === 'graphics') {
          uploadedGraphicsLayers.push(layer);
        } else if (layer.type === 'geojson' || layer.type === 'csv') {
          // GeoJSONLayer / CSVLayer support queryFeatures natively
          layersToQuery.push({
            layer,
            title: layer.title || layer.id,
            isUploaded: true,
            config: { id: layer.id, url: null }
          });
        }
      });

      // ── 3. Execute queryFeatures on all collected layers ─────────────
      await Promise.all(layersToQuery.map(async (item) => {
        try {
          let response;
          let fieldsInfo = [];

          if (!item.layer.queryFeatures) {
            // MapImageLayer sublayer → query via temp FeatureLayer
            const url = `${item.config.url}/${item.layer.id}`;
            const tempLayer = new FeatureLayer({ url });
            await tempLayer.load();
            response = await tempLayer.queryFeatures({
              geometry,
              spatialRelationship: 'intersects',
              outFields: ['*'],
              returnGeometry: true
            });
            fieldsInfo = tempLayer.fields ? tempLayer.fields.map(f => ({
              name: f.name, alias: f.alias || f.name, type: f.type
            })) : [];
          } else {
            response = await item.layer.queryFeatures({
              geometry,
              spatialRelationship: 'intersects',
              outFields: ['*'],
              returnGeometry: true
            });
            fieldsInfo = item.layer.fields ? item.layer.fields.map(f => ({
              name: f.name, alias: f.alias || f.name, type: f.type
            })) : [];
          }

          if (response.features.length > 0) {
            results.total += response.features.length;
            results.grouped[item.title] = response.features.map(f => ({
              attributes: f.attributes,
              geometry: f.geometry,
              layerId: item.config.id,
              layerTitle: item.title,
              displayField: item.layer.displayField || Object.keys(f.attributes || {})[0] || 'Feature',
              fields: fieldsInfo
            }));

            response.features.forEach(f => {
              const isPoint = f.geometry?.type === 'point';
              identifyGraphicsLayer.current.add(new Graphic({
                geometry: f.geometry,
                symbol: isPoint
                  ? { type: 'simple-marker', style: 'circle', color: [0, 255, 255, 0.4], outline: { color: 'cyan', width: 2 } }
                  : { type: 'simple-fill', color: [0, 255, 255, 0.1], outline: { color: 'cyan', width: 2 } }
              }));
            });
          }
        } catch (err) {
          console.warn(`[Identify] Query failed for "${item.title}":`, err.message);
        }
      }));

      // ── 4. Spatial match for GraphicsLayer (Excel uploads) ───────────
      for (const glayer of uploadedGraphicsLayers) {
        const matched = [];
        glayer.graphics.forEach(g => {
          if (!g.geometry || g.visible === false) return;
          try {
            if (
              geometryEngine.intersects(geometry, g.geometry) ||
              geometryEngine.contains(geometry, g.geometry)
            ) {
              matched.push(g);
            }
          } catch (_) {}
        });

        if (matched.length > 0) {
          const layerTitle = glayer.title || glayer.id;
          results.total += matched.length;
          const sampleAttrs = matched[0].attributes || {};
          const fieldsInfo = Object.keys(sampleAttrs).map(k => ({ name: k, alias: k, type: 'string' }));

          results.grouped[layerTitle] = matched.map(g => ({
            attributes: g.attributes || {},
            geometry: g.geometry,
            layerId: glayer.id,
            layerTitle,
            displayField: Object.keys(g.attributes || {})[0] || 'Feature',
            fields: fieldsInfo
          }));

          matched.forEach(g => {
            identifyGraphicsLayer.current.add(new Graphic({
              geometry: g.geometry,
              symbol: { type: 'simple-marker', style: 'circle', color: [0, 255, 255, 0.4], outline: { color: 'cyan', width: 2 } }
            }));
          });
        }
      }

      onIdentifyResults(results);
    };


    performQueryRef.current = performQuery;

    let clickHandler;
    if (identifySettings.selectedLayerId) {
      if (identifySettings.mode === 'point') {
        clickHandler = view.on('click', (e) => performQuery(e.mapPoint));
      } else {
        sketchVM.current.create(identifySettings.mode);
      }
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

    console.log('[DataRequest] Effect run →', { activeTool, dataRequestStep, dataRequestDrawingTool, hasView: !!view });

    // Cancel and bail when not in data_request mode
    if (!view || activeTool !== 'data_request') {
      console.log('[DataRequest] Bailing – not active or no view');
      if (dataRequestSketchVM.current) {
        try { dataRequestSketchVM.current.cancel(); } catch (e) {}
      }
      return;
    }

    // Ensure graphics layers are on the map
    if (!view.map.findLayerById('data-request-aoi-layer')) {
      view.map.add(dataRequestLayer.current);
      console.log('[DataRequest] AOI layer added to map');
    }
    if (!view.map.findLayerById('data-request-final-layer')) {
      view.map.add(dataRequestFinalLayer.current);
    }

    // Wait for a specific tool to be selected before starting
    if (dataRequestStep !== 'drawing' || !dataRequestDrawingTool) {
      console.log('[DataRequest] Waiting for tool selection (step=' + dataRequestStep + ', tool=' + dataRequestDrawingTool + ')');
      if (dataRequestSketchVM.current) {
        try { dataRequestSketchVM.current.cancel(); } catch (e) {}
      }
      return;
    }

    const capturedTool = dataRequestDrawingTool;
    console.log('[DataRequest] ✅ Starting sketch, tool:', capturedTool);

    const getIntersectingLayers = async (geometry) => {
      const promises = layersConfig.map(async (config) => {
        const layer = layersRef.current[config.id];
        if (!layer) return null;
        try {
          if (layer.type === 'feature') {
            const q = layer.createQuery();
            q.geometry = geometry;
            q.spatialRelationship = 'intersects';
            const count = await layer.queryFeatureCount(q);
            if (count > 0) return { id: config.id, title: config.title };
          } else if (layer.type === 'map-image' && layer.allSublayers) {
            const sublayerPromises = layer.allSublayers.toArray()
              .filter(sub => !sub.sublayers)
              .map(async (sub) => {
                try {
                  const q = sub.createQuery();
                  q.geometry = geometry;
                  q.spatialRelationship = 'intersects';
                  const count = await sub.queryFeatureCount(q);
                  if (count > 0) {
                    return { id: `${config.id}_sub_${sub.id}`, title: `${config.title} - ${sub.title}` };
                  }
                } catch (e) {
                  if (sub.fullExtent && geometryEngine.intersects(geometry, sub.fullExtent)) {
                    return { id: `${config.id}_sub_${sub.id}`, title: `${config.title} - ${sub.title}` };
                  }
                }
                return null;
              });
            const sublayerResults = await Promise.all(sublayerPromises);
            const validSublayerResults = sublayerResults.filter(Boolean);
            if (validSublayerResults.length > 0) {
              return validSublayerResults; // Return array of sublayers
            }
            if (layer.fullExtent && geometryEngine.intersects(geometry, layer.fullExtent)) {
              return { id: config.id, title: config.title };
            }
          }
        } catch (err) {
          console.warn(`[DataRequest] ${config.title}:`, err);
        }
        return null;
      });

      const results = await Promise.all(promises);
      const intersecting = [];
      results.forEach(res => {
        if (!res) return;
        if (Array.isArray(res)) {
          intersecting.push(...res);
        } else {
          intersecting.push(res);
        }
      });

      // Check uploaded layers
      try {
        view.map.allLayers.forEach(ul => {
          if (!ul.id?.startsWith('uploaded-')) return;
          if (ul.type === 'graphics') {
            let h = false;
            ul.graphics.forEach(g => { if (g.geometry && geometryEngine.intersects(geometry, g.geometry)) h = true; });
            if (h) intersecting.push({ id: ul.id, title: ul.title || ul.id });
          }
        });
      } catch (e) { /* ignore */ }

      return intersecting;
    };

    // ── Mirror Identify pattern: create-once / reuse ──────────────────────────
    const fillSymbol = {
      type: 'simple-fill',
      color: [223, 38, 28, 0.1],
      outline: { color: '#df261c', width: 2, style: 'dash' }
    };

    if (!dataRequestSketchVM.current) {
      console.log('[DataRequest] Creating SketchViewModel for first time');
      dataRequestSketchVM.current = new SketchViewModel({
        view,
        layer: dataRequestLayer.current,
        updateOnGraphicClick: false,
        polygonSymbol: fillSymbol,
        rectangleSymbol: fillSymbol,
        circleSymbol: fillSymbol
      });

      dataRequestSketchVM.current.on('create', async (event) => {
        console.log('[DataRequest] create event state:', event.state);
        if (event.state === 'complete') {
          const geometry = event.graphic.geometry;
          dataRequestLayer.current.removeAll();
          const finalGraphic = event.graphic.clone();
          finalGraphic.symbol = {
            type: 'simple-fill',
            color: [223, 38, 28, 0.15],
            outline: { color: '#df261c', width: 2 }
          };
          dataRequestFinalLayer.current.removeAll();
          dataRequestFinalLayer.current.add(finalGraphic);
          view.cursor = 'default';
          
          // Switch to form step and show loading state instantly
          onDataRequestAOIChange(geometry, [], true, true);
          
          const layers = await getIntersectingLayers(geometry);
          console.log('[DataRequest] Intersecting layers found:', layers.length, layers);
          
          // Replace loading state with actual matched layers
          onDataRequestAOIChange(geometry, layers, true, false);
        }
      });
    } else {
      console.log('[DataRequest] Reusing existing SketchViewModel');
      dataRequestSketchVM.current.view = view;
    }

    dataRequestLayer.current.removeAll();
    view.cursor = 'crosshair'; // Visual feedback identical to Identify tool

    console.log('[DataRequest] Calling create() | VM state before:', dataRequestSketchVM.current.state);
    dataRequestSketchVM.current.create(capturedTool);
    console.log('[DataRequest] create() called | VM state after:', dataRequestSketchVM.current.state);

    return () => {
      console.log('[DataRequest] Cleanup – cancelling VM');
      if (dataRequestSketchVM.current) {
        try { dataRequestSketchVM.current.cancel(); } catch (e) {}
      }
      view.cursor = 'default';
    };
  }, [activeTool, dataRequestDrawingTool, dataRequestStep]);

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
