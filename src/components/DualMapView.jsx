import React, { useEffect, useRef, useState } from 'react';
import Map from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import TileLayer from '@arcgis/core/layers/TileLayer';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import { layersConfig } from '../layers';

const DualMapView = ({ isSplitView, splitLayers, basemap, syncMode, onExit }) => {
  const leftMapDiv = useRef(null);
  const rightMapDiv = useRef(null);
  
  const [leftView, setLeftView] = useState(null);
  const [rightView, setRightView] = useState(null);
  const [splitPercentage, setSplitPercentage] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isSplitView || !leftMapDiv.current || !rightMapDiv.current) return;

    // Create Left Map (Historical)
    const leftMap = new Map({ basemap: basemap || 'gray-vector' });
    const viewLeft = new MapView({
      container: leftMapDiv.current,
      map: leftMap,
      center: [50.55, 26.22],
      zoom: 9,
      ui: { components: [] }
    });

    // Create Right Map (Current)
    const rightMap = new Map({ basemap: basemap || 'satellite' });
    const viewRight = new MapView({
      container: rightMapDiv.current,
      map: rightMap,
      center: [50.55, 26.22],
      zoom: 9,
      ui: { components: [] }
    });

    setLeftView(viewLeft);
    setRightView(viewRight);

    // Sync views logic
    let leftWatch, rightWatch;
    
    viewLeft.when(() => {
      viewRight.when(() => {
        const sync = (master, slave) => {
          return reactiveUtils.watch(
            () => master.viewpoint,
            (vp) => {
              // Only sync if the master is being moved by the user or an animation
              if (!master.interacting && !master.animation) return;
              
              if (syncMode === 'both') {
                slave.viewpoint = vp;
              } else if (syncMode === 'zoom') {
                // For zoom only, we keep the slave center but match the scale
                slave.scale = vp.targetGeometry.type === 'point' ? master.scale : slave.scale;
                // Alternatively, more simply:
                if (slave.zoom !== master.zoom) {
                  slave.zoom = master.zoom;
                }
              }
            }
          );
        };

        if (syncMode !== 'none') {
          leftWatch = sync(viewLeft, viewRight);
          rightWatch = sync(viewRight, viewLeft);
        }
      });
    });

    return () => {
      if (leftWatch) leftWatch.remove();
      if (rightWatch) rightWatch.remove();
      viewLeft.destroy();
      viewRight.destroy();
    };
  }, [isSplitView, basemap, syncMode]);

  // Update Layers dynamically when splitLayers changes
  useEffect(() => {
    if (!leftView || !rightView) return;
    
    const leftConfig = layersConfig.find(l => l.id === splitLayers.left);
    const rightConfig = layersConfig.find(l => l.id === splitLayers.right);

    const updateMapLayers = (map, config, isHistorical) => {
      map.removeAll();
      if (config) {
        const LayerClass = config.type === 'tile' ? TileLayer : FeatureLayer;
        const layer = new LayerClass({
          id: config.id,
          url: config.url,
          title: config.title
        });
        if (isHistorical) layer.effect = 'grayscale(1.0) brightness(0.8) contrast(1.2)';
        map.add(layer);
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
        <div className="map-label left-label">Left: {layersConfig.find(l => l.id === splitLayers.left)?.title || 'Historical View'}</div>
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
        <div className="map-label right-label">Right: {layersConfig.find(l => l.id === splitLayers.right)?.title || 'Current View'}</div>
      </div>

    </div>
  );
};

export default DualMapView;
