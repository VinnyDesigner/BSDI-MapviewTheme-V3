/**
 * GP Result Renderer
 * ──────────────────────────────────────────────────────────────────────────
 * Renders GP tool outputs to the ArcGIS MapView and/or results data store.
 *
 * renderMode → strategy:
 *   MapLayer    → adds a GraphicsLayer or FeatureLayer to map
 *   Table       → returns structured data for the panel table renderer
 *   Text        → string value shown in the panel
 *   Download    → triggers a file download
 */

import Graphic from '@arcgis/core/Graphic';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';

/** Layer ID prefix for all GP result layers */
const GP_LAYER_PREFIX = 'gp-result-';

/** Colour palette for auto-assignment to successive GP result layers */
const RESULT_COLOURS = [
  [38, 143, 255],
  [40, 167, 69],
  [255, 193, 7],
  [220, 53, 69],
  [111, 66, 193],
  [23, 162, 184],
  [253, 126, 20],
];

let _colourIndex = 0;
function nextColour() {
  return RESULT_COLOURS[_colourIndex++ % RESULT_COLOURS.length];
}

/**
 * Main entry — processes all outputs from a GP job and dispatches to sub-renderers.
 *
 * @param {Object} opts
 * @param {Object}   opts.result      – normalised result object from GPExecutionEngine
 * @param {Object[]} opts.outputDefs  – manifest.outputs array
 * @param {Object}   opts.view        – ArcGIS MapView / SceneView
 * @param {string}   opts.runId       – unique run identifier
 * @param {string}   opts.toolName    – display name of the tool
 * @returns {Promise<Object[]>}  – array of rendered result descriptors
 */
export async function renderGPResults({ result, outputDefs, view, runId, toolName, colour }) {
  const rendered = [];
  const rgbColour = hexToRgb(colour);

  for (const out of result.outputs) {
    const def = outputDefs.find(d => d.name === out.name) || {
      name: out.name,
      label: out.name,
      outputType: 'String',
      renderMode: 'Text',
    };

    let renderResult;
    switch (def.renderMode) {
      case 'MapLayer':
        renderResult = await _renderMapLayer(out, def, view, runId, toolName, rgbColour);
        break;
      case 'Table':
        renderResult = _renderTable(out, def);
        break;
      case 'Download':
        renderResult = _renderDownload(out, def, toolName);
        break;
      default: // 'Text'
        renderResult = _renderText(out, def);
    }

    if (renderResult) rendered.push(renderResult);
  }

  // Zoom map to first MapLayer result
  const mapLayerResult = rendered.find(r => r.renderMode === 'MapLayer');
  if (mapLayerResult?.extent && view) {
    try {
      await view.goTo({ target: mapLayerResult.extent.expand(2.5) });
    } catch (_) {}
  }

  return rendered;
}

/**
 * Remove all GP result layers for a specific runId.
 */
export function removeGPResultLayer(view, runId) {
  if (!view?.map) return;

  // Clean up any 3D Viewshed exploratory analyses
  if (view.analyses) {
    const toRemove = [];
    view.analyses.forEach(analysis => {
      if (analysis.runId === runId || (analysis.title && analysis.title.includes(runId))) {
        toRemove.push(analysis);
      }
    });
    toRemove.forEach(a => {
      try {
        view.analyses.remove(a);
      } catch (err) {
        console.warn('Failed to remove 3D viewshed analysis', err);
      }
    });
  }

  const prefix = `${GP_LAYER_PREFIX}${runId}`;
  const layersToRemove = view.map.layers.filter(l => l.id && l.id.startsWith(prefix)).toArray();
  layersToRemove.forEach(layer => {
    view.map.remove(layer);
  });
}

/**
 * Toggle visibility of a GP result layer.
 */
export function toggleGPResultLayer(view, runId, visible) {
  if (!view?.map) return;

  // Toggle 3D Viewshed exploratory analyses
  if (view.analyses) {
    view.analyses.forEach(analysis => {
      if (analysis.runId === runId || (analysis.title && analysis.title.includes(runId))) {
        analysis.visible = visible;
      }
    });
  }

  const prefix = `${GP_LAYER_PREFIX}${runId}`;
  view.map.layers.forEach(layer => {
    if (layer.id && layer.id.startsWith(prefix)) {
      layer.visible = visible;
    }
  });
}

// ── Private render strategies ───────────────────────────────────────────────

async function _renderMapLayer(out, def, view, runId, toolName, rgbColour) {
  if (!view?.map) return null;

  const layerId = `${GP_LAYER_PREFIX}${runId}-${out.name}`;
  const colour = rgbColour || nextColour();
  let fullExtent = null;
  let featureCount = 0;

  // ── FeatureSet (features array) ─────────────────────────────────────
  if (_isFeatureSet(out.value)) {
    const graphicsLayer = new GraphicsLayer({
      id: layerId,
      title: `${toolName}: ${def.label}`,
    });

    const features = out.value.features || out.value;
    const rawFeatureCount = Array.isArray(features) ? features.length : 0;
    for (const f of features) {
      const geom = _esriGeomToGraphic(f.geometry || f);
      if (!geom) continue;

      let symbol;
      if (f.attributes?.Visibility === 'Visible Area') {
        symbol = {
          type: 'simple-fill',
          color: [22, 163, 74, 0.45],
          outline: { color: [22, 163, 74, 0.85], width: 1.5 }
        };
      } else if (f.attributes?.Visibility === 'Non-visible Area') {
        symbol = {
          type: 'simple-fill',
          color: [220, 38, 38, 0.35],
          outline: { color: [220, 38, 38, 0.75], width: 1.5 }
        };
      } else {
        symbol = _autoSymbol(geom.type, colour);
      }

      const graphic = new Graphic({
        geometry: geom,
        symbol,
        attributes: { ...(f.attributes || {}), runId, outputName: out.name },
      });
      graphicsLayer.add(graphic);

      let geomExtent = graphic.geometry?.extent;
      if (!geomExtent && graphic.geometry?.type === 'point') {
        const pt = graphic.geometry;
        geomExtent = {
          xmin: pt.x - 100,
          ymin: pt.y - 100,
          xmax: pt.x + 100,
          ymax: pt.y + 100,
          spatialReference: pt.spatialReference
        };
      }

      if (geomExtent) {
        if (!fullExtent) {
          fullExtent = {
            xmin: geomExtent.xmin,
            ymin: geomExtent.ymin,
            xmax: geomExtent.xmax,
            ymax: geomExtent.ymax,
            spatialReference: geomExtent.spatialReference
          };
        } else {
          fullExtent.xmin = Math.min(fullExtent.xmin, geomExtent.xmin);
          fullExtent.ymin = Math.min(fullExtent.ymin, geomExtent.ymin);
          fullExtent.xmax = Math.max(fullExtent.xmax, geomExtent.xmax);
          fullExtent.ymax = Math.max(fullExtent.ymax, geomExtent.ymax);
        }
      }
      featureCount++;
    }

    view.map.add(graphicsLayer);

    return {
      renderMode: 'MapLayer',
      layerId,
      label: def.label,
      rawFeatureCount,
      featureCount,
      extent: fullExtent,
      type: 'graphics',
    };
  }

  // ── Raster (URL string) ────────────────────────────────────────────
  if (typeof out.value === 'string' && out.outputType === 'Raster') {
    const FeatureLayerCtor = FeatureLayer; // just for raster image services; could use ImageryLayer
    return {
      renderMode: 'MapLayer',
      layerId,
      label: def.label,
      featureCount: 0,
      extent: null,
      type: 'raster',
      url: out.value,
    };
  }

  return null;
}

function _renderTable(out, def) {
  const rows = _toRows(out.value);
  return {
    renderMode: 'Table',
    label: def.label,
    rows,
  };
}

function _renderText(out, def) {
  return {
    renderMode: 'Text',
    label: def.label,
    text: String(out.value ?? ''),
  };
}

function _renderDownload(out, def, toolName) {
  const filename = `${toolName}_${def.name}.geojson`;
  const geojson = {
    type: 'FeatureCollection',
    features: _toGeoJSON(out.value),
  };
  const blob = new Blob([JSON.stringify(geojson)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  return {
    renderMode: 'Download',
    label: def.label,
    downloadUrl: url,
    filename,
  };
}

// ── Geometry helpers ────────────────────────────────────────────────────────

function _isFeatureSet(value) {
  if (!value) return false;
  if (Array.isArray(value)) return value.length === 0 || (value[0]?.geometry || value[0]?.x !== undefined);
  return value.features !== undefined || value.geometryType !== undefined;
}

function _esriGeomToGraphic(geom) {
  if (!geom) return null;
  // Already-deserialized ESRI geometry objects (from JS API)
  if (typeof geom.type === 'string') return geom;

  // Plain JSON from GP service
  if (geom.x !== undefined) return { type: 'point', x: geom.x, y: geom.y, spatialReference: geom.spatialReference };
  if (geom.rings) return { type: 'polygon', rings: geom.rings, spatialReference: geom.spatialReference };
  if (geom.paths) return { type: 'polyline', paths: geom.paths, spatialReference: geom.spatialReference };
  return null;
}

function _autoSymbol(geomType, colour) {
  const [r, g, b] = colour;
  if (geomType === 'point' || geomType === 'multipoint') {
    return { type: 'simple-marker', color: [r, g, b, 0.9], size: 8, outline: { color: [r, g, b, 1], width: 1 } };
  }
  if (geomType === 'polyline') {
    return { type: 'simple-line', color: [r, g, b, 1], width: 2.5 };
  }
  // polygon / default
  return { type: 'simple-fill', color: [r, g, b, 0.3], outline: { color: [r, g, b, 1], width: 2 } };
}

function _toRows(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value.features) return value.features.map(f => f.attributes || {});
  return [value];
}

function _toGeoJSON(value) {
  if (!value) return [];
  const features = Array.isArray(value) ? value : value.features || [value];
  return features.map(f => ({
    type: 'Feature',
    geometry: f.geometry || null,
    properties: f.attributes || f.properties || {},
  }));
}

function hexToRgb(hex) {
  if (!hex) return null;
  try {
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return [r, g, b];
  } catch (e) {
    return null;
  }
}
