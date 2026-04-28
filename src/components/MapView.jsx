import React, { useEffect, useRef, useState } from 'react';
import Map from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import SceneView from '@arcgis/core/views/SceneView';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import TileLayer from '@arcgis/core/layers/TileLayer';
import SceneLayer from '@arcgis/core/layers/SceneLayer';
import Swipe from '@arcgis/core/widgets/Swipe';
import { layersConfig } from '../layers';

// Import ArcGIS CSS
import '@arcgis/core/assets/esri/themes/light/main.css';

const ArcGISMap = ({ layerVisibility, onViewReady, isSplitMode, splitLayers, basemap, is3D }) => {
  const mapDiv = useRef(null);
  const viewRef = useRef(null);
  const swipeRef = useRef(null);
  const layersRef = useRef({});
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
      // Set visibility
      Object.keys(layersRef.current).forEach(id => {
        const layer = layersRef.current[id];
        layer.visible = (id === splitLayers.left || id === splitLayers.right);
      });

      const leftLayer = layersRef.current[splitLayers.left];
      const rightLayer = layersRef.current[splitLayers.right];

      if (leftLayer && rightLayer) {
        if (swipeRef.current) {
          swipeRef.current.leadingLayers = [leftLayer];
          swipeRef.current.trailingLayers = [rightLayer];
          // SWAP TO TEST: If 'vertical' gave horizontal, maybe 'horizontal' gives vertical?
          swipeRef.current.direction = 'horizontal'; 
        } else {
          const swipe = new Swipe({
            view: view,
            leadingLayers: [leftLayer],
            trailingLayers: [rightLayer],
            direction: 'horizontal', // Trying 'horizontal' to achieve a vertical line split
            position: 50
          });
          view.ui.add(swipe);
          swipeRef.current = swipe;
        }
      }
    } else {
      if (swipeRef.current) {
        swipeRef.current.destroy();
        swipeRef.current = null;
      }
      Object.keys(layersRef.current).forEach(id => {
        layersRef.current[id].visible = !!layerVisibility[id];
      });
    }
  }, [isSplitMode, splitLayers, layerVisibility]);

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
