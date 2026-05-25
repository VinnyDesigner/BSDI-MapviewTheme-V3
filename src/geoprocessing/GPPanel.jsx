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
import { Database, Search, ChevronRight, ChevronLeft, Plus, X, AlertCircle, Loader, CheckCircle2, Layers } from 'lucide-react';
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

// ── Main Panel component ───────────────────────────────────────────────────────

const GPPanel = ({
  view,
  layersConfig = [],
  dynamicMapServerData = {},
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

  const { t, lang } = useLanguage();
  const isRTL = lang === 'AR';

  const engineRef = useRef(null);

  const allTools = getAllGPTools();
  const selectedManifest = selectedToolId ? getGPTool(selectedToolId) : null;

  // ── Layer tree (re-used from existing TreeSelect infrastructure) ──────────
  const treeData = useMemo(() => {
    const tree = [];
    layersConfig.forEach(l => {
      if (l.type === 'feature') {
        tree.push({ id: l.id, title: l.title, type: 'feature', selectable: true, children: [] });
      } else if (l.type === 'map-image') {
        const mapData = dynamicMapServerData[l.id];
        if (mapData?.metadata?.layers) {
          const subs = mapData.metadata.layers
            .filter(s => s.parentLayerId == null || s.parentLayerId === -1)
            .map(s => ({
              id: `${l.id}_sub_${s.id}`,
              title: s.name || s.title,
              type: 'feature', selectable: true, children: [],
            }));
          if (subs.length > 0) {
            tree.push({ id: l.id, title: l.title, type: 'root-group', selectable: false, children: subs });
          }
        }
      }
    });
    return tree;
  }, [layersConfig, dynamicMapServerData]);

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

  // ── Tool selection ────────────────────────────────────────────────────────
  const selectTool = (toolId) => {
    setSelectedToolId(toolId);
    setActiveTab('run');
  };

  // ── Run analysis ──────────────────────────────────────────────────────────
  const handleRunTool = useCallback(async () => {
    if (!selectedManifest || isRunning) return;

    const runId   = `gp-run-${Date.now()}`;
    const colour  = nextRunColour();

    setIsRunning(true);
    setJobStatus({ status: 'submitting', message: t('gpStatusSubmitting'), progress: 0 });

    const engine = new GPExecutionEngine(selectedManifest);
    engineRef.current = engine;

    try {
      const result = await engine.run(paramValues, {
        onStatusUpdate: (update) => setJobStatus({ ...update, progress: update.progress ?? null }),
      });

      // Render outputs to map
      const rendered = await renderGPResults({
        result,
        outputDefs: selectedManifest.outputs || [],
        view,
        runId,
        toolName: selectedManifest.meta.name,
      });

      const totalFeatures = rendered
        .filter(r => r.renderMode === 'MapLayer')
        .reduce((sum, r) => sum + (r.featureCount || 0), 0);

      const run = {
        id: runId,
        toolId: selectedManifest.toolId,
        toolName: t(selectedManifest.meta.name) || selectedManifest.meta.name,
        colour,
        date: new Date().toLocaleString(),
        status: result.success ? 'Succeeded' : 'Failed',
        visible: true,
        rendered,
        totalFeatures,
        jobId: result.jobId,
      };

      setRuns(prev => [run, ...prev]);
      setActiveTab('results');
      setJobStatus({ status: 'succeeded', message: t('gpStatusComplete'), progress: 100 });
    } catch (err) {
      setJobStatus({ status: 'failed', message: err.message, progress: null });
    } finally {
      setIsRunning(false);
      engineRef.current = null;
    }
  }, [selectedManifest, paramValues, view, isRunning]);

    engineRef.current?.cancel();
    setIsRunning(false);
    setJobStatus({ status: 'cancelled', message: t('gpStatusCancelled') });

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
    const mapLayerResult = run?.rendered?.find(r => r.renderMode === 'MapLayer');
    if (mapLayerResult?.extent) {
      view.goTo({ target: mapLayerResult.extent.expand(1.2) });
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

  // ── Status banner ─────────────────────────────────────────────────────────
  const StatusBanner = () => {
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
          {selectedManifest ? t(selectedManifest.meta.name) : t('gpTabRun')}
        </button>
        <button className={`tool-tab ${activeTab === 'results' ? 'active' : ''}`} onClick={() => setActiveTab('results')}>
          {t('gpTabResults')} {runs.length > 0 && <span className="tab-badge">{runs.length}</span>}
        </button>
      </div>

      <div className="panel-content-scroll" style={{ flex: 1, padding: '6px 0', overflow: 'auto' }}>
        {/* ── Browse tab ── */}
        {activeTab === 'browse' && (
          <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', [isRTL ? 'right' : 'left']: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
              <input
                className="tool-input"
                placeholder={t('gpSearchPlaceholder')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ paddingLeft: isRTL ? 8 : 30, paddingRight: isRTL ? 30 : 8 }}
              />
            </div>

            {/* Add from URL button */}
            <button
              className="secondary-btn"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
              onClick={() => setAddUrlOpen(true)}
            >
              <Plus size={13} /> {t('gpAddServiceUrl')}
            </button>

            {/* Tool list grouped by category */}
            {Object.entries(toolsByCategory).length === 0 && (
              <div className="empty-state">
                <div className="empty-card">
                  <div className="empty-icon-wrapper"><Database size={28} /></div>
                  <h3 className="empty-title">{t('gpNoToolsFound')}</h3>
                  <p className="empty-desc">{t('gpNoToolsDesc')}</p>
                </div>
              </div>
            )}

            {Object.entries(toolsByCategory).map(([cat, tools]) => (
              <div key={cat}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 4 }}>
                  {t(`gpCategory${cat}`) !== `gpCategory${cat}` ? t(`gpCategory${cat}`) : cat}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {tools.map(tool => (
                    <button
                      key={tool.toolId}
                      onClick={() => selectTool(tool.toolId)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', borderRadius: 8,
                        background: selectedToolId === tool.toolId ? 'rgba(0,45,93,0.06)' : 'white',
                        border: selectedToolId === tool.toolId ? '1px solid rgba(0,45,93,0.15)' : '1px solid #e2e8f0',
                        cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                      }}
                      className="gp-tool-card"
                    >
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{tool.meta.icon || '⚙️'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1a2f4d', marginBottom: 2 }}>
                          {t(tool.meta.name)}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t(tool.meta.description)}
                        </div>
                      </div>
                      {isRTL ? <ChevronLeft size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Configure & Run tab ── */}
        {activeTab === 'run' && selectedManifest && (
          <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Tool header */}
            <div style={{ padding: '10px 12px', background: 'rgba(0,45,93,0.04)', borderRadius: 8, [isRTL ? 'borderRight' : 'borderLeft']: '3px solid #002D5D' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#002D5D', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{selectedManifest.meta.icon}</span> {t(selectedManifest.meta.name)}
              </div>
              {selectedManifest.meta.description && (
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#64748b' }}>{t(selectedManifest.meta.description)}</p>
              )}
            </div>

            {/* Dynamic form */}
            <GPFormRenderer
              params={selectedManifest.parameters}
              values={paramValues}
              onChange={(name, val) => setParamValues(prev => ({ ...prev, [name]: val }))}
              treeData={treeData}
            />

            {/* Status */}
            <StatusBanner />

            {/* Validation warnings */}
            {missingRequired.length > 0 && !isRunning && (
              <div style={{ fontSize: 11, color: '#dc3545', display: 'flex', alignItems: 'flex-start', gap: 5 }}>
                <AlertCircle size={12} style={{ marginTop: 1, flexShrink: 0 }} />
                {t('gpMissingRequired')} {missingRequired.join(', ')}
              </div>
            )}
            
            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
               {isRunning ? (
                  <button className="secondary-btn" onClick={handleCancelRun} style={{ padding: '8px 16px', background: '#fff' }}>
                     {t('gpBtnCancel')}
                  </button>
               ) : (
                  <button className="primary-btn" onClick={handleRunTool} style={{ padding: '8px 16px', flex: 1, background: '#002D5D' }}>
                     {t('gpBtnRun')}
                  </button>
               )}
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
