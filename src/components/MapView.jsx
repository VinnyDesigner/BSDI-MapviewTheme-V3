import React, { useEffect, useRef } from 'react';
import Map from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import { layersConfig } from '../layers';

// Import ArcGIS CSS
import '@arcgis/core/assets/esri/themes/light/main.css';

const ArcGISMap = ({ layerVisibility, onViewReady }) => {
  const mapDiv = useRef(null);
  const layersRef = useRef({});

  useEffect(() => {
    if (mapDiv.current) {
      // Initialize Map
      const map = new Map({
        basemap: 'streets-navigation-vector'
      });

      // Initialize View
      const view = new MapView({
        container: mapDiv.current,
        map: map,
        center: [-98, 39], // Center of US
        zoom: 4,
        ui: {
          components: [] // Remove all default UI components
        }
      });

      if (onViewReady) {
        onViewReady(view);
      }

      // Add Layers
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

      return () => {
        if (view) {
          view.destroy();
        }
      };
    }
  }, []);

  // Sync React state with ArcGIS layers
  useEffect(() => {
    Object.keys(layerVisibility).forEach(id => {
      if (layersRef.current[id]) {
        layersRef.current[id].visible = layerVisibility[id];
      }
    });
  }, [layerVisibility]);

  return <div className="map-view" ref={mapDiv}></div>;
};

export default ArcGISMap;
