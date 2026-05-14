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

const DualMapView = ({ isSplitView, splitLayers, splitBasemaps, splitModes, basemap, syncMode, onExit }) => {
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
          ui: { components: [] }
        });

        return view;
      } else {
        const map = new Map({
          basemap: splitBasemaps?.[side] || basemap || 'streets-navigation-vector'
        });

        return new MapView({
          container,
          map,
          center: [50.55, 26.22],
          zoom: 12,
          ui: { components: [] }
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
    
    const leftConfig = layersConfig.find(l => l.id === splitLayers.left);
    const rightConfig = layersConfig.find(l => l.id === splitLayers.right);

    const updateMapLayers = (map, config, isHistorical) => {
      // Remove only operational layers, preserve all core 3D scene environment layers
      const toRemove = map.layers.filter(lyr => 
        lyr.id !== 'esri-3d-buildings' && 
        lyr.id !== '3d-trees' && 
        lyr.id !== '3d-labels' &&
        lyr.id !== 'detailed-buildings' && 
        lyr.id !== 'mesh-layer'
      );
      map.removeMany(toRemove.toArray());

      if (config) {
        let layer;
        if (config.type === 'tile') {
          layer = new TileLayer({ id: config.id, url: config.url, title: config.title });
        } else if (config.type === 'map-image') {
          layer = new MapImageLayer({ id: config.id, url: config.url, title: config.title });
        } else {
          layer = new FeatureLayer({ id: config.id, url: config.url, title: config.title });
        }

        if (isHistorical) layer.effect = 'grayscale(1.0) brightness(0.8) contrast(1.2)';
        
        // Add at index 0 to stay below buildings/mesh
        map.add(layer, 0);
      }
    };

    updateMapLayers(leftView.map, leftConfig, true);
    updateMapLayers(rightView.map, rightConfig, false);

  }, [leftView, rightView, splitLayers]);

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
          {splitModes?.left || '2D'} | {layersConfig.find(l => l.id === splitLayers.left)?.title || 'No Layer'}
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
          {splitModes?.right || '2D'} | {layersConfig.find(l => l.id === splitLayers.right)?.title || 'No Layer'}
        </div>
      </div>

    </div>
  );
};

export default DualMapView;
