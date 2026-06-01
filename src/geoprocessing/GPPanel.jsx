/**
 * GPPanel — Main Geoprocessing Panel
 * ──────────────────────────────────────────────────────────────────────────
 * Plug-and-play replacement for any "comingSoon" panel slot.
 * Wired into App.jsx via panelRegistry just like SpatialAnalysisPanel.
 *
 * Features:
 *  - Tool browser (all registered manifests, searchable, grouped by category)
 *  - Dynamic form auto-generated from selected tool's parameter descriptors
 *  - Async GP job monitoring with live progress/status updates
 *  - Live results tab with MapLayer, Table, Text, Download renderers
 *  - Per-run visibility, zoom, export (GeoJSON/CSV/Excel/Image), and delete
 *  - "Add from Service URL" dialog — fetch any ArcGIS GP endpoint on-the-fly
 *
 * Architecture:
 *  Registry Pattern  — gpRegistry stores & looks up manifests
 *  Factory Pattern   — GPFormRenderer selects widgets per widgetType
 *  Metadata-driven   — no tool-specific React code; forms emerge from data
 *  Plugin-based      — tools added via registerGPTool() at startup
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Database, Search, ChevronRight, ChevronLeft, Plus, X, AlertCircle, Loader, CheckCircle2, Layers, Target, Eye, Scissors, BarChart2, MapPin } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../context/LanguageContext';

import { getAllGPTools, getGPTool, registerGPTool, hasGPTools } from './gpRegistry';
import { fetchAndParseGPMetadata } from './gpParamParser';
import { GPExecutionEngine } from './gpEngine';
import { renderGPResults, removeGPResultLayer, toggleGPResultLayer } from './gpResultRenderer';
import { graphicsToGeoJSON } from './crsUtils';
import GPFormRenderer from './GPFormRenderer';
import GPResultCard from './GPResultCard';
import DEFAULT_MANIFESTS from './defaultManifests';

// Self-register default tools on first import
let _defaultsRegistered = false;
if (!_defaultsRegistered) {
  registerGPTool(DEFAULT_MANIFESTS);
  _defaultsRegistered = true;
}

// ── Run colours (cycles through) ──────────────────────────────────────────────
const RUN_COLOURS = ['#268FFF','#28a745','#ffc107','#dc3545','#6f42c1','#17a2b8','#fd7e14'];
let _runColourIdx = 0;
const nextRunColour = () => RUN_COLOURS[_runColourIdx++ % RUN_COLOURS.length];

// ── Status Banner (must live OUTSIDE GPPanel to avoid infinite re-render) ────────
const StatusBanner = ({ jobStatus, isRTL }) => {
  if (!jobStatus) return null;
  const isWaiting = ['submitting', 'submitted', 'esriJobExecuting', 'esriJobWaiting'].includes(jobStatus.status);
  const isError   = ['failed', 'esriJobFailed', 'esriJobTimedOut', 'cancelled'].includes(jobStatus.status);
  const isOk      = jobStatus.status === 'succeeded' || jobStatus.status === 'esriJobSucceeded';

  return (
    <div className={`status-box ${isOk ? 'success' : isError ? '' : 'waiting'}`}
      style={{ borderLeft: isError ? '3px solid #dc3545' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {isWaiting && <Loader size={13} className="gp-spinner" />}
        {isOk && <CheckCircle2 size={13} color="#28a745" />}
        {isError && <AlertCircle size={13} color="#dc3545" />}
        <span style={{ fontSize: 12, color: isError ? '#dc3545' : undefined }}>
          {jobStatus.message}
        </span>
      </div>
      {jobStatus.progress != null && isWaiting && (
        <div style={{ marginTop: 6, height: 4, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 4,
            background: 'linear-gradient(90deg,#002D5D,#df261c)',
            width: `${jobStatus.progress}%`, transition: 'width 0.4s ease',
            ...(isRTL ? { transform: 'scaleX(-1)', transformOrigin: 'right' } : {})
          }} />
        </div>
      )}
    </div>
  );
};

const GPPanel = ({
  view,
  layersConfig = [],
  dynamicMapServerData = {},
  treeData,
  results = [],
  setResults,
  setLayerOrder,
  setLayerVisibility
}) => {
  const [activeTab, setActiveTab]       = useState('browse');   // 'browse' | 'run' | 'results'
  const [selectedToolId, setSelectedToolId] = useState(null);
  const [paramValues, setParamValues]   = useState({});
  const [searchQuery, setSearchQuery]   = useState('');
  const [jobStatus, setJobStatus]       = useState(null);       // null | { status, message, progress, jobId }
  const [isRunning, setIsRunning]       = useState(false);
  const [runs, setRuns]                 = useState([]);
  const [addUrlOpen, setAddUrlOpen]     = useState(false);
  const [urlFetchState, setUrlFetchState]     = useState(null); // null | 'loading' | 'error' | 'done'
  const [urlFetchError, setUrlFetchError]     = useState('');
  const [serviceUrlDraft, setServiceUrlDraft] = useState('');

  const { t, lang } = useLanguage();
  const isRTL = lang === 'AR';

  const engineRef = useRef(null);

  const allTools = getAllGPTools();
  const selectedManifest = selectedToolId ? getGPTool(selectedToolId) : null;

  // ── Default parameter values when tool is selected ────────────────────────
  useEffect(() => {
    if (!selectedManifest) return;
    const defaults = {};
    selectedManifest.parameters.forEach(p => {
      defaults[p.name] = p.defaultValue ?? '';
    });
    setParamValues(defaults);
    setJobStatus(null);
  }, [selectedManifest]);

  // ── Dynamic Reactive Tree Data for GP Layer Picker ─────────────────────────
  const dynamicTreeData = useMemo(() => {
    if (!view?.map) return treeData || [];

    const items = [];

    view.map.layers.forEach(layer => {
      // Exclude system layers that we shouldn't buffer or query
      const isSystemLayer = [
        'identify-highlights', 'identify-sketch-layer',
        'data-request-aoi-layer', 'data-request-final-layer',
        'graphics-layer-draw', 'graphicsLayer', 'spatial-analysis-layer'
      ].includes(layer.id) || layer.id?.startsWith('heatmap-');
      
      if (isSystemLayer) return;

      // Group / Multi-layers (MapServer / FeatureServer with sublayers)
      if (layer.type === 'map-image') {
        const subItems = [];
        if (layer.allSublayers) {
          layer.allSublayers.forEach(sub => {
            const hasChildren = sub.subLayerIds && sub.subLayerIds.length > 0;
            if (!hasChildren) {
              subItems.push({
                id: `${layer.id}_sub_${sub.id}`,
                title: sub.title || sub.name,
                type: 'feature',
                selectable: true
              });
            }
          });
        }
        if (subItems.length > 0) {
          items.push({
            id: layer.id,
            title: layer.title || layer.id,
            type: 'root-group',
            selectable: false,
            children: subItems
          });
        }
      } else {
        items.push({
          id: layer.id,
          title: layer.title || layer.id,
          type: 'feature',
          selectable: true
        });
      }
    });

    return items;
  }, [view, treeData, runs]);

  // ── Dynamic Parameter Fields & Options based on selection ───────────────
  const modifiedParameters = useMemo(() => {
    if (!selectedManifest) return [];
    if (selectedManifest.toolId !== 'gp_buffer') return selectedManifest.parameters;

    const params = selectedManifest.parameters.map(p => ({ ...p }));
    const dissolveTypeParam = params.find(p => p.name === 'Dissolve_Type');
    const dissolveFieldParam = params.find(p => p.name === 'Dissolve_Field');

    const selectedInputLayerId = paramValues.Input_Features;
    const selectedDissolveType = paramValues.Dissolve_Type || 'none';

    // 1. Hide Dissolve Field if dissolve type is not 'by-field'
    let filteredParams = params;
    if (selectedDissolveType !== 'by-field') {
      filteredParams = params.filter(p => p.name !== 'Dissolve_Field');
    }

    // 2. Query fields for the selected layer to dynamically fill Dissolve Field
    if (selectedInputLayerId && dissolveFieldParam) {
      let targetLayer = null;
      if (view?.map) {
        if (selectedInputLayerId.includes('_sub_')) {
          const [parentId, subId] = selectedInputLayerId.split('_sub_');
          const parent = view.map.findLayerById(parentId);
          if (parent && parent.allSublayers) {
            targetLayer = parent.allSublayers.find(s => s.id === parseInt(subId));
          }
        } else {
          targetLayer = view.map.findLayerById(selectedInputLayerId);
        }
      }

      let fields = [];
      if (targetLayer) {
        if (targetLayer.fields) {
          fields = targetLayer.fields.map(f => f.name);
        } else if (targetLayer.layer?.fields) {
          fields = targetLayer.layer.fields.map(f => f.name);
        } else if (targetLayer.graphics && targetLayer.graphics.length > 0) {
          const firstGraphic = targetLayer.graphics.getItemAt(0);
          if (firstGraphic && firstGraphic.attributes) {
            fields = Object.keys(firstGraphic.attributes);
          }
        }
      }

      if (fields.length > 0) {
        dissolveFieldParam.choiceList = fields;
      } else {
        dissolveFieldParam.choiceList = [];
      }
    }

    return filteredParams;
  }, [selectedManifest, paramValues.Input_Features, paramValues.Dissolve_Type, view, dynamicTreeData]);

  // ── Auto-select first dissolve field option if available ───────────────────
  useEffect(() => {
    if (selectedToolId !== 'gp_buffer') return;
    const selectedInputLayerId = paramValues.Input_Features;
    const selectedDissolveType = paramValues.Dissolve_Type || 'none';
    
    if (selectedDissolveType === 'by-field' && selectedInputLayerId) {
      let targetLayer = null;
      if (view?.map) {
        if (selectedInputLayerId.includes('_sub_')) {
          const [parentId, subId] = selectedInputLayerId.split('_sub_');
          const parent = view.map.findLayerById(parentId);
          if (parent && parent.allSublayers) {
            targetLayer = parent.allSublayers.find(s => s.id === parseInt(subId));
          }
        } else {
          targetLayer = view.map.findLayerById(selectedInputLayerId);
        }
      }

      let fields = [];
      if (targetLayer) {
        if (targetLayer.fields) {
          fields = targetLayer.fields.map(f => f.name);
        } else if (targetLayer.layer?.fields) {
          fields = targetLayer.layer.fields.map(f => f.name);
        } else if (targetLayer.graphics && targetLayer.graphics.length > 0) {
          const firstGraphic = targetLayer.graphics.getItemAt(0);
          if (firstGraphic && firstGraphic.attributes) {
            fields = Object.keys(firstGraphic.attributes);
          }
        }
      }

      if (fields.length > 0 && !fields.includes(paramValues.Dissolve_Field)) {
        setParamValues(prev => ({ ...prev, Dissolve_Field: fields[0] }));
      }
    }
  }, [selectedToolId, paramValues.Input_Features, paramValues.Dissolve_Type, view]);


  // ── Tool selection ────────────────────────────────────────────────────────
  const selectTool = (toolId) => {
    setSelectedToolId(toolId);
    setActiveTab('run');
  };

  // ── Run analysis ──────────────────────────────────────────────────────────
  const handleRunTool = useCallback(async () => {
    if (!selectedManifest || isRunning) return;

    const runId   = `gp-run-${Date.now()}`;
    const colour = selectedManifest.toolId === 'gp_viewshed'
      ? '#16a34a' // Green for Viewshed
      : selectedManifest.toolId === 'gp_clip'
      ? '#f97316' // Orange for Clip
      : selectedManifest.toolId === 'gp_summarize_within'
      ? '#9333ea' // Purple for Summarize
      : selectedManifest.toolId === 'gp_geocode'
      ? '#ec4899' // Pink for Geocode
      : '#268fff'; // Blue for Buffer / Default

    setIsRunning(true);
    setJobStatus({ status: 'submitting', message: t('gpStatusSubmitting'), progress: 0 });

    const engine = new GPExecutionEngine(selectedManifest);
    engineRef.current = engine;

    try {
      const result = await engine.run(paramValues, {
        onStatusUpdate: (update) => setJobStatus({ ...update, progress: update.progress ?? null }),
        view,
      });

      const outputLayerName = (selectedManifest.toolId === 'gp_buffer' || selectedManifest.toolId === 'gp_viewshed' || selectedManifest.toolId === 'gp_clip' || selectedManifest.toolId === 'gp_summarize_within' || selectedManifest.toolId === 'gp_geocode')
        ? (paramValues.Output_Layer_Name || result.raw?.Output_Layer_Name)
        : selectedManifest.meta.name;

      // Render outputs to map
      const rendered = await renderGPResults({
        result,
        outputDefs: selectedManifest.outputs || [],
        view,
        runId,
        toolName: outputLayerName,
        colour,
      });

      // ── Required Validation and Debug Information Logging ──────────────────────
      rendered.filter(r => r.renderMode === 'MapLayer').forEach(r => {
        const layer = view.map.findLayerById(r.layerId);
        console.log("=== GEOPROCESSING RESULT VALIDATION & DEBUG ===");
        console.log("Result Layer ID: ", r.layerId);
        console.log("Geometry Type:   ", r.geometryType || 'polygon');
        console.log("Feature Count:   ", r.featureCount);
        console.log("Layer Extent:    ", r.extent ? JSON.stringify(r.extent.toJSON ? r.extent.toJSON() : r.extent, null, 2) : 'null');
        console.log("Visibility State:", layer ? layer.visible : 'Not added to map');
        console.log("Renderer:        ", layer ? (layer.renderer ? JSON.stringify(layer.renderer.toJSON ? layer.renderer.toJSON() : layer.renderer) : 'SimpleRenderer') : 'N/A');
        console.log("Opacity:         ", layer ? layer.opacity : 'N/A');
        console.log("==================================================");
      });

      const hasFeaturesButNoGeom = rendered
        .filter(r => r.renderMode === 'MapLayer')
        .some(r => r.rawFeatureCount > 0 && r.featureCount === 0);

      const totalFeatures = rendered
        .filter(r => r.renderMode === 'MapLayer')
        .reduce((sum, r) => sum + (r.featureCount || 0), 0);

      const run = {
        id: runId,
        toolId: selectedManifest.toolId,
        toolName: outputLayerName,
        colour,
        date: new Date().toLocaleString(),
        status: result.success ? 'Succeeded' : 'Failed',
        visible: true,
        rendered,
        totalFeatures,
        jobId: result.jobId,
        metadata: result.raw,
        hasFeaturesButNoGeom,
      };

      // Automatically register the output layer in the Layers panel / addDataResults
      if ((selectedManifest.toolId === 'gp_buffer' || selectedManifest.toolId === 'gp_viewshed' || selectedManifest.toolId === 'gp_clip' || selectedManifest.toolId === 'gp_summarize_within' || selectedManifest.toolId === 'gp_geocode') && setResults) {
        const mapLayerResult = rendered.find(r => r.renderMode === 'MapLayer');
        if (mapLayerResult) {
          const layerId = mapLayerResult.layerId;
          const layer = view.map.findLayerById(layerId);
          if (layer) {
            // Register layer order and visibility
            if (setLayerOrder) setLayerOrder(prev => [layerId, ...prev]);
            if (setLayerVisibility) setLayerVisibility(prev => ({ ...prev, [layerId]: true }));

            // Create flat list object for results tree
            const childObj = {
              id: layerId,
              name: outputLayerName,
              visible: true,
              layer,
              color: selectedManifest.toolId === 'gp_viewshed'
                ? [22, 163, 74]
                : selectedManifest.toolId === 'gp_clip'
                ? [249, 115, 22]
                : selectedManifest.toolId === 'gp_summarize_within'
                ? [147, 51, 234] // Purple for summarize within
                : selectedManifest.toolId === 'gp_geocode'
                ? [236, 72, 153] // Pink/Magenta for geocode addresses
                : [38, 143, 255], // Green for viewshed, Orange for clip, Purple for summarize, Pink for geocode, Blue for buffer
              geometryType: mapLayerResult.geometryType || 'point',
              featureCount: mapLayerResult.featureCount || 0
            };

            const resultObj = {
              id: `gp-parent-${Date.now()}`,
              name: outputLayerName,
              date: new Date().toLocaleString(),
              featureCount: mapLayerResult.featureCount || 0,
              visible: true,
              type: 'multi-file',
              children: [childObj]
            };

            setResults(prev => [resultObj, ...prev]);
          }
        }
      }

      setRuns(prev => [run, ...prev]);
      setActiveTab('results');
      setJobStatus({ status: 'succeeded', message: t('gpStatusComplete'), progress: 100 });
    } catch (err) {
      setJobStatus({ status: 'failed', message: err.message, progress: null });
    } finally {
      setIsRunning(false);
      engineRef.current = null;
    }
  }, [selectedManifest, paramValues, view, isRunning, t]);

  const handleCancelRun = useCallback(() => {
    engineRef.current?.cancel();
    setIsRunning(false);
    setJobStatus({ status: 'cancelled', message: t('gpStatusCancelled') });
  }, [t]);

  // ── Result actions ────────────────────────────────────────────────────────
  const handleToggle = (runId) => {
    setRuns(prev => prev.map(r => {
      if (r.id !== runId) return r;
      const next = !r.visible;
      toggleGPResultLayer(view, runId, next);
      return { ...r, visible: next };
    }));
  };

  const handleDelete = (runId) => {
    removeGPResultLayer(view, runId);
    setRuns(prev => prev.filter(r => r.id !== runId));
  };

  const handleZoom = (runId) => {
    if (!view?.map) return;
    const run = runs.find(r => r.id === runId);
    if (!run) return;

    const mapLayerResult = run.rendered?.find(r => r.renderMode === 'MapLayer');
    if (!mapLayerResult) return;

    // 1. Retrieve actual output layer
    const layer = view.map.findLayerById(mapLayerResult.layerId);
    
    // Helper to calculate unioned extent of all graphics
    const getGraphicsLayerExtent = (graphicsLayer) => {
      if (!graphicsLayer || !graphicsLayer.graphics || graphicsLayer.graphics.length === 0) return null;
      let fullExtent = null;
      graphicsLayer.graphics.forEach(g => {
        if (g.geometry) {
          let ext = g.geometry.extent;
          if (!ext && g.geometry.type === 'point') {
            const pt = g.geometry;
            ext = {
              xmin: pt.x - 50,
              ymin: pt.y - 50,
              xmax: pt.x + 50,
              ymax: pt.y + 50,
              spatialReference: pt.spatialReference
            };
          }
          if (ext) {
            if (!fullExtent) {
              fullExtent = ext.clone ? ext.clone() : { ...ext };
            } else {
              if (fullExtent.union) {
                fullExtent = fullExtent.union(ext);
              } else {
                fullExtent.xmin = Math.min(fullExtent.xmin, ext.xmin);
                fullExtent.ymin = Math.min(fullExtent.ymin, ext.ymin);
                fullExtent.xmax = Math.max(fullExtent.xmax, ext.xmax);
                fullExtent.ymax = Math.max(fullExtent.ymax, ext.ymax);
              }
            }
          }
        }
      });
      return fullExtent;
    };

    // 2. Calculate output geometry extent
    let extent = getGraphicsLayerExtent(layer);
    if (!extent) {
      extent = mapLayerResult.extent;
    }

    if (extent) {
      // 3. Execute view.goTo with padding (expand by 1.8)
      const target = extent.expand ? extent.expand(1.8) : extent;
      view.goTo({ target }, { animate: true, duration: 1500 });
    }

    // 4. Flash/highlight the result geometry for 2.5 seconds
    if (layer && layer.graphics && layer.graphics.length > 0) {
      const originalSymbols = [];
      layer.graphics.forEach(g => {
        originalSymbols.push({ graphic: g, symbol: g.symbol });
        
        let highlightSymbol;
        if (g.geometry.type === 'point') {
          highlightSymbol = {
            type: 'simple-marker',
            color: [255, 255, 0, 0.9], // Bright yellow
            size: 16,
            outline: { color: [0, 255, 255, 1], width: 2 } // Cyan outline
          };
        } else if (g.geometry.type === 'polyline') {
          highlightSymbol = {
            type: 'simple-line',
            color: [255, 255, 0, 1],
            width: 5
          };
        } else {
          // Polygon
          highlightSymbol = {
            type: 'simple-fill',
            color: [255, 255, 0, 0.45], // Semi-transparent yellow
            outline: { color: [0, 255, 255, 1], width: 3 } // Thick Cyan outline
          };
        }
        g.symbol = highlightSymbol;
      });

      // Restore original symbols after 2.5 seconds
      setTimeout(() => {
        originalSymbols.forEach(item => {
          item.graphic.symbol = item.symbol;
        });
      }, 2500);
    }
  };

  const handleExport = async (runId, format) => {
    if (!view?.map) return;
    const run = runs.find(r => r.id === runId);
    if (!run) return;

    const GraphicsLayer_id = `gp-result-${runId}`;
    const layer = view.map.findLayerById(GraphicsLayer_id) ||
      view.map.findLayerById(
        `gp-result-${runId}-${run.rendered?.[0]?.name || ''}`
      );

    if (format === 'Image') {
      const screenshot = await view.takeScreenshot({ format: 'png', quality: 100 });
      const a = document.createElement('a');
      a.href = screenshot.dataUrl;
      a.download = `${run.toolName}_${runId}.png`;
      a.click();
      return;
    }

    // Collect all graphics from matching layers
    const graphics = [];
    view.map.layers.forEach(l => {
      if (l.id?.startsWith(`gp-result-${runId}`) && l.graphics) {
        graphics.push(...l.graphics.toArray());
      }
    });

    if (graphics.length === 0) return;

    const geojson = graphicsToGeoJSON(graphics, view.spatialReference);

    if (format === 'GeoJSON') {
      const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `${run.toolName}.geojson`; a.click();
    } else if (format === 'CSV' || format === 'Excel') {
      const { default: XLSX } = await import('xlsx');
      const rows = graphics.map(g => g.attributes || {});
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'GP Results');
      if (format === 'CSV') {
        const csv = XLSX.utils.sheet_to_csv(ws);
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `${run.toolName}.csv`; a.click();
      } else {
        XLSX.writeFile(wb, `${run.toolName}.xlsx`);
      }
    }
  };

  // ── "Add from URL" dialog ─────────────────────────────────────────────────
  const handleFetchFromUrl = async () => {
    if (!serviceUrlDraft.trim()) return;
    setUrlFetchState('loading');
    setUrlFetchError('');
    try {
      const { serviceInfo, inputParams, outputParams } = await fetchAndParseGPMetadata(serviceUrlDraft.trim());
      const toolId = `gp_dynamic_${Date.now()}`;
      registerGPTool({
        toolId,
        meta: {
          name: serviceInfo.name || serviceInfo.displayName || 'Dynamic GP Tool',
          description: serviceInfo.description || '',
          category: 'Dynamic',
          icon: '⚙️',
          tags: ['dynamic'],
        },
        execution: {
          mode: 'arcgis',
          serviceUrl: serviceUrlDraft.trim(),
          executionType: serviceInfo.executionType || 'esriExecutionTypeSynchronous',
        },
        parameters: inputParams,
        outputs: outputParams.map(p => ({
          name: p.name,
          label: p.label,
          outputType: p.dataType || 'String',
          renderMode: p.widgetType === 'LayerPicker' ? 'MapLayer' : 'Text',
        })),
      });
      setUrlFetchState('done');
      setAddUrlOpen(false);
      setServiceUrlDraft('');
      selectTool(toolId);
    } catch (err) {
      setUrlFetchState('error');
      setUrlFetchError(err.message);
    }
  };

  // ── Grouped/filtered tool list ────────────────────────────────────────────
  const filteredTools = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return allTools.filter(t =>
      !q ||
      t.meta.name.toLowerCase().includes(q) ||
      t.meta.category?.toLowerCase().includes(q) ||
      t.meta.tags?.some(tag => tag.toLowerCase().includes(q))
    );
  }, [allTools, searchQuery]);

  const toolsByCategory = useMemo(() => {
    const groups = {};
    filteredTools.forEach(t => {
      const cat = t.meta.category || 'General';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(t);
    });
    return groups;
  }, [filteredTools]);

  // StatusBanner is defined above as a standalone component to prevent infinite re-renders

  // ── Validate required params before run ───────────────────────────────────
  const missingRequired = selectedManifest?.parameters
    .filter(p => p.required && (paramValues[p.name] == null || paramValues[p.name] === ''))
    .map(p => p.label) || [];

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="add-data-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', direction: isRTL ? 'rtl' : 'ltr' }}>
      {/* Tabs */}
      <div className="tool-tabs" style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
        <button className={`tool-tab ${activeTab === 'browse' ? 'active' : ''}`} onClick={() => setActiveTab('browse')}>
          {t('gpTabBrowse')}
        </button>
        <button
          className={`tool-tab ${activeTab === 'run' ? 'active' : ''}`}
          onClick={() => setActiveTab('run')}
          disabled={!selectedManifest}
          style={{ opacity: selectedManifest ? 1 : 0.4 }}
        >
          {t('gpTabRun')}
        </button>
        <button className={`tool-tab ${activeTab === 'results' ? 'active' : ''}`} onClick={() => setActiveTab('results')}>
          {t('gpTabResults')} {runs.length > 0 && <span className="tab-badge">{runs.length}</span>}
        </button>
      </div>

      {activeTab === 'run' && selectedManifest ? (() => {
        // Monochrome line icons mapping for header
        const refinedToolUI = {
          gp_buffer: {
            icon: <Target size={18} strokeWidth={2} />,
            desc: 'Create buffer polygons around selected features.'
          },
          gp_viewshed: {
            icon: <Eye size={18} strokeWidth={2} />,
            desc: 'Identify visible and non-visible areas.'
          },
          gp_clip: {
            icon: <Scissors size={18} strokeWidth={2} />,
            desc: 'Extract features within a boundary.'
          },
          gp_summarize_within: {
            icon: <BarChart2 size={18} strokeWidth={2} />,
            desc: 'Calculate statistics within polygons.'
          },
          gp_geocode: {
            icon: <MapPin size={18} strokeWidth={2} />,
            desc: 'Convert addresses into map locations.'
          }
        };

        const refined = refinedToolUI[selectedManifest.toolId] || {
          icon: <Layers size={18} strokeWidth={2} />,
          desc: selectedManifest.meta.description || ''
        };

        return (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
            {/* Sticky Selected Tool Header */}
            <div style={{
              background: '#fff',
              padding: '10px 16px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              direction: isRTL ? 'rtl' : 'ltr',
              flexShrink: 0
            }}>
              {/* Monochrome Line Icon */}
              <span style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                color: '#002D5D'
              }}>
                {refined.icon}
              </span>

              {/* Title & One-line Description */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'stretch', textAlign: 'start' }}>
                <span style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#1a2f4d',
                  lineHeight: '1.2'
                }}>
                  {t(selectedManifest.meta.name)}
                </span>
                {refined.desc && (
                  <span style={{
                    fontSize: '10.5px',
                    color: '#64748b',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    lineHeight: '1.2'
                  }}>
                    {refined.desc}
                  </span>
                )}
              </div>
            </div>

            {/* Scrollable Parameters Container (Only this section scrolls!) */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: isRTL ? '12px 0 12px 16px' : '12px 16px 12px 0',
              display: 'flex',
              flexDirection: 'column',
              gap: 16
            }}>
              {/* Dynamic form */}
              <GPFormRenderer
                params={modifiedParameters}
                values={paramValues}
                onChange={(name, val) => setParamValues(prev => ({ ...prev, [name]: val }))}
                treeData={dynamicTreeData}
              />

              {/* Status */}
              <StatusBanner jobStatus={jobStatus} isRTL={isRTL} />

              {/* Validation warnings */}
              {missingRequired.length > 0 && !isRunning && (
                <div style={{ fontSize: 11, color: '#dc3545', display: 'flex', alignItems: 'flex-start', gap: 5 }}>
                  <AlertCircle size={12} style={{ marginTop: 1, flexShrink: 0 }} />
                  {t('gpMissingRequired')} {missingRequired.join(', ')}
                </div>
              )}
            </div>
          </div>
        );
      })() : (
        // Regular scroll container for Browse and Results tabs
        <div className="panel-content-scroll" style={{ flex: 1, padding: '6px 0', overflow: 'auto' }}>
          {/* ── Browse tab ── */}
          {activeTab === 'browse' && (
            <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Search & Add Tool row */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', width: '100%' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={13} style={{ position: 'absolute', [isRTL ? 'right' : 'left']: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                  <input
                    className="tool-input"
                    placeholder={t('gpSearchPlaceholder')}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{
                      paddingLeft: isRTL ? 12 : 36,
                      paddingRight: isRTL ? 36 : 12,
                      width: '100%',
                      height: '34px',
                      fontSize: '12px'
                    }}
                  />
                </div>
                <button
                  className="secondary-btn"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: '11px',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    height: '34px',
                    padding: '0 10px',
                    borderRadius: '6px'
                  }}
                  onClick={() => setAddUrlOpen(true)}
                >
                  <Plus size={12} /> {t('gpBtnAddTool')}
                </button>
              </div>

              {/* Flat Tool List */}
              {filteredTools.length === 0 && (
                <div className="empty-state">
                  <div className="empty-card">
                    <div className="empty-icon-wrapper"><Database size={28} /></div>
                    <h3 className="empty-title">{t('gpNoToolsFound')}</h3>
                    <p className="empty-desc">{t('gpNoToolsDesc')}</p>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filteredTools.map(tool => {
                  const isSelected = selectedToolId === tool.toolId;
                  
                  // Monochrome line icons mapping and single-line description fallbacks
                  const refinedToolUI = {
                    gp_buffer: {
                      icon: <Target size={15} strokeWidth={2} />,
                      desc: 'Create buffer polygons around selected features.'
                    },
                    gp_viewshed: {
                      icon: <Eye size={15} strokeWidth={2} />,
                      desc: 'Identify visible and non-visible areas.'
                    },
                    gp_clip: {
                      icon: <Scissors size={15} strokeWidth={2} />,
                      desc: 'Extract features within a boundary.'
                    },
                    gp_summarize_within: {
                      icon: <BarChart2 size={15} strokeWidth={2} />,
                      desc: 'Calculate statistics within polygons.'
                    },
                    gp_geocode: {
                      icon: <MapPin size={15} strokeWidth={2} />,
                      desc: 'Convert addresses into map locations.'
                    }
                  };

                  const refined = refinedToolUI[tool.toolId] || {
                    icon: <Layers size={15} strokeWidth={2} />,
                    desc: tool.meta.description || ''
                  };

                  return (
                    <button
                      key={tool.toolId}
                      onClick={() => selectTool(tool.toolId)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '8px 12px',
                        borderRadius: '6px',
                        background: isSelected ? 'rgba(0,45,93,0.06)' : 'white',
                        border: isSelected ? '1px solid rgba(0,45,93,0.18)' : '1px solid #e2e8f0',
                        cursor: 'pointer',
                        textAlign: isRTL ? 'right' : 'left',
                        transition: 'all 0.12s ease-in-out',
                        width: '100%'
                      }}
                      className="gp-tool-card"
                    >
                      {/* Consistent Monochrome Line Icon */}
                      <span style={{
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '24px',
                        height: '24px',
                        color: isSelected ? '#002D5D' : '#64748b'
                      }}>
                        {refined.icon}
                      </span>

                      {/* Left Aligned Content */}
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start', textAlign: 'left' }}>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#1a2f4d',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          lineHeight: '1.2'
                        }}>
                          {t(tool.meta.name)}
                        </span>
                        {refined.desc && (
                          <span style={{
                            fontSize: '10.5px',
                            color: '#64748b',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            lineHeight: '1.2'
                          }}>
                            {refined.desc}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Results tab ── */}
          {activeTab === 'results' && (
            <div className="results-list">
              {runs.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-card">
                    <div className="empty-icon-wrapper"><Layers size={28} /></div>
                    <h3 className="empty-title">{t('gpNoResultsYet')}</h3>
                    <p className="empty-desc">{t('gpNoResultsDesc')}</p>
                  </div>
                </div>
              ) : runs.map(run => (
                <GPResultCard
                  key={run.id}
                  run={run}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onZoom={handleZoom}
                  onExport={handleExport}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      {activeTab === 'run' && selectedManifest && (
        <div className="tool-fixed-footer">
          <button className="secondary-btn" onClick={() => setActiveTab('browse')}>
            ← {t('gpBtnBack')}
          </button>
          {isRunning ? (
            <button className="primary-btn" onClick={handleCancelRun} style={{ background: '#dc3545' }}>
              {t('gpBtnCancel')}
            </button>
          ) : (
            <button
              className="primary-btn"
              onClick={handleRunTool}
              disabled={missingRequired.length > 0}
              style={{ opacity: missingRequired.length > 0 ? 0.5 : 1 }}
            >
              {t('gpBtnRun')}
            </button>
          )}
        </div>
      )}

      {/* Add from URL dialog */}
      {addUrlOpen && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setAddUrlOpen(false)}>
          <div style={{
            background: 'white', borderRadius: 12, padding: 24, width: 440, maxWidth: '90vw',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)', direction: isRTL ? 'rtl' : 'ltr'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#002D5D' }}>{t('gpAddServiceUrl')}</h3>
              <button onClick={() => setAddUrlOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={16} />
              </button>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>
              {t('gpLabelUrlPlaceholder') !== 'gpLabelUrlPlaceholder' ? t('gpLabelUrlPlaceholder') : 'Paste an ArcGIS GP service endpoint. Parameters will be auto-discovered.'}
            </p>
            <input
              className="tool-input"
              placeholder="https://server.com/arcgis/rest/services/.../GPServer/ToolName"
              value={serviceUrlDraft}
              onChange={e => { setServiceUrlDraft(e.target.value); setUrlFetchState(null); setUrlFetchError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleFetchFromUrl()}
            />
            {urlFetchError && (
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#dc3545' }}>⚠ {urlFetchError}</p>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
              <button className="secondary-btn" onClick={() => setAddUrlOpen(false)}>{t('gpBtnCancel')}</button>
              <button
                className="primary-btn"
                onClick={handleFetchFromUrl}
                disabled={urlFetchState === 'loading' || !serviceUrlDraft.trim()}
              >
                {urlFetchState === 'loading' ? t('gpLoading') : t('gpBtnAddTool')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Spinner keyframe style */}
      <style>{`
        @keyframes gp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .gp-spinner { animation: gp-spin 0.8s linear infinite; }
        .gp-tool-card:hover { border-color: rgba(0,45,93,0.25) !important; background: rgba(0,45,93,0.04) !important; }
        .gp-field-label { display: block; font-size: 12px; font-weight: 600; color: #1a2f4d; margin-bottom: 5px; }
        .gp-required-star { color: #dc3545; margin-left: 3px; }
        .gp-field-desc { margin: 0 0 5px; font-size: 11px; color: #94a3b8; }
        .gp-category-label { font-size: 10px; font-weight: 700; color: #94a3b8; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #f1f5f9; }
      `}</style>
    </div>
  );
};

export default GPPanel;
