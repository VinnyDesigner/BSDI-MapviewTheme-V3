import React, { useEffect, useRef, useState } from 'react';
import Map from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import SceneView from '@arcgis/core/views/SceneView';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import { layersConfig } from '../layers';

// Import ArcGIS CSS
import '@arcgis/core/assets/esri/themes/light/main.css';

const ArcGISMap = ({ layerVisibility, onViewReady, is3D }) => {
  const mapDiv = useRef(null);
  const layersRef = useRef({});
  const mapRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Track position to maintain it when switching 2D/3D
  const centerRef = useRef([50.55, 26.22]);
  const zoomRef = useRef(9);

  // 1. Initialize Map and Layers ONCE
  useEffect(() => {
    if (!mapRef.current) {
      const map = new Map({
        basemap: 'streets-navigation-vector',
        ground: 'world-elevation' // Re-enabled for real 3D terrain
      });

      layersConfig.forEach(config => {
        const layer = new FeatureLayer({
          id: config.id,
          url: config.url,
          title: config.title,
          visible: layerVisibility[config.id] ?? config.visible
        });
        map.add(layer);
        layersRef.current[config.id] = layer;
      });

      mapRef.current = map;
    }

    return () => {
      // Destroy map only on full unmount
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Initialize or recreate View when is3D changes
  useEffect(() => {
    if (!mapDiv.current || !mapRef.current) return;

    setIsLoading(true);

    const ViewClass = is3D ? SceneView : MapView;
    const viewProps = {
      container: mapDiv.current,
      map: mapRef.current,
      center: centerRef.current,
      zoom: zoomRef.current,
      ui: {
        components: [] // Remove default UI
      }
    };

    if (!is3D) {
      viewProps.constraints = { minZoom: 6, maxZoom: 18 };
    }

    const view = new ViewClass(viewProps);

    // Track movement so we resume at the same spot when toggling
    const watchHandle = reactiveUtils.watch(
      () => view.stationary,
      (isStationary) => {
        if (isStationary && view.center) {
          centerRef.current = [view.center.longitude, view.center.latitude];
          zoomRef.current = view.zoom;
        }
      }
    );

    view.when(() => {
      setIsLoading(false);
      
      // Add the 3D perspective tilt animation
      if (is3D) {
        view.goTo({ tilt: 60 }, { animate: true, duration: 1500, easing: 'ease-out' }).catch(() => {});
      } else {
        // Reset tilt just in case when returning to 2D
        view.goTo({ tilt: 0 }, { animate: false }).catch(() => {});
      }

      if (onViewReady) {
        onViewReady(view);
      }
    });

    return () => {
      watchHandle.remove();
      if (view) {
        if (view.center) {
          centerRef.current = [view.center.longitude, view.center.latitude];
          zoomRef.current = view.zoom || 9;
        }
        if (onViewReady) onViewReady(null);
        view.map = null; // Detach map to ensure it doesn't get destroyed
        view.destroy(); // Let it clean up its container inner DOM
      }
    };
  }, [is3D, onViewReady]);

  // 3. Sync React state with ArcGIS layers
  useEffect(() => {
    Object.keys(layerVisibility).forEach(id => {
      if (layersRef.current[id]) {
        layersRef.current[id].visible = layerVisibility[id];
      }
    });
  }, [layerVisibility]);

  return (
    <div className="map-view" style={{ position: 'relative' }}>
      <div ref={mapDiv} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}></div>
      {isLoading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50,
          background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(4px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Inter', color: '#1a2f4d', fontWeight: '600'
        }}>
          <div className="loader" style={{
            border: '3px solid #f3f3f3', borderTop: '3px solid #1a2f4d',
            borderRadius: '50%', width: '30px', height: '30px', animation: 'spin 1s linear infinite',
            marginBottom: '10px'
          }}></div>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          {is3D ? 'Switching to 3D View...' : 'Loading Map...'}
        </div>
      )}
    </div>
  );
};

export default ArcGISMap;
