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
export async function renderGPResults({ result, outputDefs, view, runId, toolName }) {
  const rendered = [];

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
        renderResult = await _renderMapLayer(out, def, view, runId, toolName);
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
      await view.goTo({ target: mapLayerResult.extent.expand(1.2) });
    } catch (_) {}
  }

  return rendered;
}

/**
 * Remove all GP result layers for a specific runId.
 */
export function removeGPResultLayer(view, runId) {
  if (!view?.map) return;
  const layerId = `${GP_LAYER_PREFIX}${runId}`;
  const layer = view.map.findLayerById(layerId);
  if (layer) view.map.remove(layer);
}

/**
 * Toggle visibility of a GP result layer.
 */
export function toggleGPResultLayer(view, runId, visible) {
  if (!view?.map) return;
  const layer = view.map.findLayerById(`${GP_LAYER_PREFIX}${runId}`);
  if (layer) layer.visible = visible;
}

// ── Private render strategies ───────────────────────────────────────────────

async function _renderMapLayer(out, def, view, runId, toolName) {
  if (!view?.map) return null;

  const layerId = `${GP_LAYER_PREFIX}${runId}-${out.name}`;
  const colour = nextColour();
  let fullExtent = null;
  let featureCount = 0;

  // ── FeatureSet (features array) ─────────────────────────────────────
  if (_isFeatureSet(out.value)) {
    const graphicsLayer = new GraphicsLayer({
      id: layerId,
      title: `${toolName}: ${def.label}`,
    });

    const features = out.value.features || out.value;
    for (const f of features) {
      const geom = _esriGeomToGraphic(f.geometry || f);
      if (!geom) continue;

      const symbol = _autoSymbol(geom.type, colour);
      const graphic = new Graphic({
        geometry: geom,
        symbol,
        attributes: { ...(f.attributes || {}), runId, outputName: out.name },
      });
      graphicsLayer.add(graphic);

      if (graphic.geometry?.extent) {
        fullExtent = fullExtent
          ? fullExtent.union(graphic.geometry.extent)
          : graphic.geometry.extent.clone();
      }
      featureCount++;
    }

    view.map.add(graphicsLayer);

    return {
      renderMode: 'MapLayer',
      layerId,
      label: def.label,
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
