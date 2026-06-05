import React, { useEffect, useRef, useState } from 'react';
import Map from '@arcgis/core/Map';
import WebScene from '@arcgis/core/WebScene';
import MapView from '@arcgis/core/views/MapView';
import SceneView from '@arcgis/core/views/SceneView';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import TileLayer from '@arcgis/core/layers/TileLayer';
import SceneLayer from '@arcgis/core/layers/SceneLayer';
import BuildingSceneLayer from '@arcgis/core/layers/BuildingSceneLayer';
import IntegratedMeshLayer from '@arcgis/core/layers/IntegratedMeshLayer';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import Point from '@arcgis/core/geometry/Point';
import MapImageLayer from '@arcgis/core/layers/MapImageLayer';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import { layersConfig } from '../layers';

const DualMapView = ({ isSplitView, splitLayers, splitBasemaps, splitModes, basemap, syncMode, dynamicMapServerData, onExit }) => {
  const leftMapDiv = useRef(null);
  const rightMapDiv = useRef(null);
  
  const [leftView, setLeftView] = useState(null);
  const [rightView, setRightView] = useState(null);
  const [splitPercentage, setSplitPercentage] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isSplitView || !leftMapDiv.current || !rightMapDiv.current) return;

    let vLeft, vRight;

    const init3DStack = (map) => {
      // 1. Esri 3D Buildings (V1)
      const buildingsLayer = new SceneLayer({
        url: "https://basemaps3d.arcgis.com/arcgis/rest/services/Esri3D_Buildings_v1/SceneServer",
        title: "Esri 3D Buildings",
        id: "esri-3d-buildings",
        popupEnabled: true,
        opacity: 1.0
      });
      map.add(buildingsLayer);

      // 2. Open3D Trees
      const treesLayer = new SceneLayer({
        url: "https://basemaps3d.arcgis.com/arcgis/rest/services/Open3D_Trees_v1/SceneServer",
        title: "3D Trees",
        id: "3d-trees",
        popupEnabled: false
      });
      map.add(treesLayer);

      // 3. Open3D Dark Labels (ensure they are at the top)
      const labelsLayer = new SceneLayer({
        url: "https://basemaps3d.arcgis.com/arcgis/rest/services/Open3D_DarkLabels_v1/SceneServer",
        title: "3D Labels",
        id: "3d-labels",
        popupEnabled: false
      });
      map.add(labelsLayer);

      // 4. Fallback/Complementary: BuildingSceneLayer for interior details
      const specializedBuildings = new BuildingSceneLayer({
        portalItem: { id: "ca0470dbbddb4db28bad74ed39949e25" },
        title: "Detailed Interior Buildings",
        id: "detailed-buildings"
      });
      map.add(specializedBuildings);
    };

    const createView = (container, side) => {
      const mode = splitModes?.[side] || '2D';
      
      if (mode === '3D') {
        const scene = new WebScene({
          basemap: splitBasemaps?.[side] || basemap || 'satellite',
          ground: 'world-elevation'
        });

        init3DStack(scene);

        const view = new SceneView({
          container,
          map: scene,
          qualityProfile: "high",
          viewingMode: "global",
          constraints: {
            tilt: {
              max: 179 // Ensure tilt is NOT locked
            }
          },
          camera: {
            position: { longitude: 50.55, latitude: 26.22, z: 800 },
            tilt: 75,
            heading: 25
          },
          environment: {
            atmosphereEnabled: true,
            starsEnabled: false,
            lighting: {
              directShadowsEnabled: true,
              ambientOcclusionEnabled: true,
              date: new Date("May 15, 2024 10:00:00 UTC")
            }
          },
          ui: { components: [] },
          popupEnabled: false
        });

        return view;
      } else {
        const map = new Map({
          basemap: splitBasemaps?.[side] || basemap || 'streets-navigation-vector'
        });

        return new MapView({
          container,
          map,
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
      }
    };

    vLeft = createView(leftMapDiv.current, 'left');
    vRight = createView(rightMapDiv.current, 'right');

    console.log(`[SplitView] Left View Type: ${vLeft.type}`);
    console.log(`[SplitView] Right View Type: ${vRight.type}`);

    setLeftView(vLeft);
    setRightView(vRight);

    // Sync logic
    vLeft.when(() => {
      vRight.when(() => {
        const sync = (master, slave) => {
          return reactiveUtils.watch(
            () => master.viewpoint,
            (vp) => {
              if (!master.interacting && !master.animation) return;
              if (syncMode === 'both') {
                slave.viewpoint = vp;
              } else if (syncMode === 'zoom') {
                if (slave.zoom !== master.zoom) slave.zoom = master.zoom;
              }
            }
          );
        };

        if (syncMode !== 'none') {
          vLeft._syncHandle = sync(vLeft, vRight);
          vRight._syncHandle = sync(vRight, vLeft);
        }
      });
    });

    return () => {
      if (vLeft) {
        if (vLeft._syncHandle) vLeft._syncHandle.remove();
        vLeft.destroy();
      }
      if (vRight) {
        if (vRight._syncHandle) vRight._syncHandle.remove();
        vRight.destroy();
      }
      setLeftView(null);
      setRightView(null);
    };
  }, [isSplitView, splitModes, syncMode]); // Removed basemap/splitBasemaps from here to handle them dynamically below

  // Update Basemaps dynamically
  useEffect(() => {
    if (leftView && splitBasemaps?.left) {
      leftView.map.basemap = splitBasemaps.left;
    }
    if (rightView && splitBasemaps?.right) {
      rightView.map.basemap = splitBasemaps.right;
    }
  }, [leftView, rightView, splitBasemaps]);

  // Update Layers dynamically when splitLayers changes
  useEffect(() => {
    if (!leftView || !rightView) return;
    
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

    const updateMapLayers = (map, parsedLayers, side) => {
      // Find all current operational split layers
      const existingLayers = map.layers.filter(lyr => lyr.id && lyr.id.endsWith(`_split_${side}`));
      
      // Determine which ones to keep/remove
      const neededLayerIds = Object.keys(parsedLayers).map(id => `${id}_split_${side}`);
      const toRemove = existingLayers.filter(lyr => !neededLayerIds.includes(lyr.id));
      map.removeMany(toRemove.toArray());

      // Add or update needed layers
      Object.entries(parsedLayers).forEach(([layerId, data]) => {
        const { config, subIds } = data;
        if (!config) return;

        const targetId = `${layerId}_split_${side}`;
        let layer = map.findLayerById(targetId);

        if (!layer) {
          // Create new layer instance
          if (config.type === 'tile') {
            layer = new TileLayer({ id: targetId, url: config.url, title: config.title });
          } else if (config.type === 'map-image') {
            layer = new MapImageLayer({ id: targetId, url: config.url, title: config.title });
          } else {
            // Support FeatureServer suffix handling if needed, but using direct url usually works for FeatureLayer
            let layerUrl = config.url;
            if (layerUrl && (layerUrl.toLowerCase().endsWith('featureserver') || layerUrl.toLowerCase().endsWith('featureserver/'))) {
              layerUrl = layerUrl.endsWith('/') ? `${layerUrl}0` : `${layerUrl}/0`;
            }
            layer = new FeatureLayer({ id: targetId, url: layerUrl, title: config.title });
          }
          map.add(layer);
        }

        // Ensure layer is visible
        layer.visible = true;

        // Apply sublayer visibility if applicable
        if (layer.type === 'map-image') {
          layer.load().then(() => {
            if (!layer.allSublayers) return;
            layer.allSublayers.forEach(sub => {
              if (!sub.sublayers) {
                // If subIds is null, it means the entire MapImageLayer was selected, so show all sublayers.
                sub.visible = subIds === null ? true : subIds.includes(sub.id);
              } else {
                sub.visible = true; // Keep groups visible so children can render
              }
            });
          });
        }
      });
    };

    updateMapLayers(leftView.map, leftParsed, 'left');
    updateMapLayers(rightView.map, rightParsed, 'right');

  }, [leftView, rightView, splitLayers, dynamicMapServerData]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const offset = e.clientX - rect.left;
      const percentage = (offset / rect.width) * 100;
      
      if (percentage >= 20 && percentage <= 80) {
        setSplitPercentage(percentage);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!isSplitView) return null;

  return (
    <div className="split-container" ref={containerRef}>
      <div ref={leftMapDiv} className="map-panel" style={{ width: `${splitPercentage}%` }}>
        <div className="map-label left-label">
          {splitModes?.left || '2D'} | {
            Array.isArray(splitLayers.left) && splitLayers.left.length > 0
              ? (splitLayers.left.length === 1 
                  ? (splitLayers.left[0].includes('_sub_') ? '1 sublayer' : layersConfig.find(l => l.id === splitLayers.left[0])?.title || '1 layer')
                  : `${splitLayers.left.length} layers`)
              : 'No Layer'
          }
        </div>
      </div>
      
      <div 
        className="divider" 
        onMouseDown={(e) => { e.preventDefault(); setIsDragging(true); }}
      >
        <div className="divider-handle">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M4 12L10 6V10H14V6L20 12L14 18V14H10V18L4 12Z" />
          </svg>
        </div>
      </div>

      <div ref={rightMapDiv} className="map-panel" style={{ width: `${100 - splitPercentage}%` }}>
        <div className="map-label right-label">
          {splitModes?.right || '2D'} | {
            Array.isArray(splitLayers.right) && splitLayers.right.length > 0
              ? (splitLayers.right.length === 1 
                  ? (splitLayers.right[0].includes('_sub_') ? '1 sublayer' : layersConfig.find(l => l.id === splitLayers.right[0])?.title || '1 layer')
                  : `${splitLayers.right.length} layers`)
              : 'No Layer'
          }
        </div>
      </div>

    </div>
  );
};

export default DualMapView;
