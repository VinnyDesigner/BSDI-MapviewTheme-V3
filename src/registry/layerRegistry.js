import { layersConfig, basemaps } from '../config/services/layers';

/**
 * Layer Registry Helper Methods
 */

export const getLayersConfig = () => {
  return layersConfig;
};

export const getBasemaps = () => {
  return basemaps;
};

export const getLayerById = (layerId) => {
  return layersConfig.find(l => l.id === layerId) || null;
};

export const getBasemapById = (basemapId) => {
  return basemaps.find(b => b.id === basemapId) || null;
};

export const getTimeEnabledLayers = () => {
  // timeEnabled was removed — layers with a timeField are considered time-enabled
  return layersConfig.filter(l => l.timeField);
};

export const getLayerType = (layerId) => {
  const layer = getLayerById(layerId);
  return layer ? layer.type : null;
};
