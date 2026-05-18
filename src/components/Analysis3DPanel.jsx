import React, { useState, useEffect, useRef } from 'react';
import { Scissors, Ruler, Square, Box, ChevronDown } from 'lucide-react';
import SidePanel from './SidePanel';
import './Analysis3DPanel.css';

const TOOLS = [
  { id: 'slice',    icon: <Scissors size={18} />, label: 'Slice'    },
  { id: 'distance', icon: <Ruler    size={18} />, label: 'Distance' },
  { id: 'area',     icon: <Square   size={18} />, label: 'Area'     },
  { id: 'volume',   icon: <Box      size={18} />, label: 'Volume'   },
];

const Analysis3DPanel = ({ view, is3D }) => {
  const [activeTool, setActiveTool] = useState(null);
  const [measureData, setMeasureData] = useState(null);
  const widgetRef      = useRef(null);
  const widgetMountRef = useRef(null);

  /* ── Cleanup ─────────────────────────────────────────────────────────── */
  const clearAll = () => {
    if (widgetRef.current) {
      try { widgetRef.current.destroy?.(); } catch (_) {}
      widgetRef.current = null;
    }
    try { view?.analyses?.removeAll(); } catch (_) {}
    if (widgetMountRef.current) widgetMountRef.current.innerHTML = '';
    setActiveTool(null);
  };

  useEffect(() => () => clearAll(), []);
  useEffect(() => { if (!is3D) clearAll(); }, [is3D]);

  /* ── Activate tool ───────────────────────────────────────────────────── */
  const activateTool = async (toolId) => {
    if (!view) return;
    if (activeTool === toolId) { clearAll(); return; }

    if (widgetRef.current) {
      try { widgetRef.current.destroy?.(); } catch (_) {}
      widgetRef.current = null;
    }
    try { view?.analyses?.removeAll(); } catch (_) {}
    if (widgetMountRef.current) widgetMountRef.current.innerHTML = '';

    setActiveTool(toolId);
    await new Promise(r => setTimeout(r, 30));

    switch (toolId) {
      case 'slice': {
        const { default: Slice } = await import('@arcgis/core/widgets/Slice');
        const w = new Slice({ view });
        w.viewModel.start();
        widgetRef.current = { destroy: () => w.destroy() };
        break;
      }
      case 'distance': {
        const { default: DLM } = await import('@arcgis/core/widgets/DirectLineMeasurement3D');
        const { watch } = await import('@arcgis/core/core/reactiveUtils');
        const w = new DLM({ view }); // No container! Headless widget.
        w.viewModel.start();
        setMeasureData({}); // Trigger re-render
        
        const handle = watch(
          () => w.viewModel.measurement,
          (measurement) => setMeasureData(measurement)
        );

        widgetRef.current = {
          viewModel: w.viewModel,
          destroy: () => { handle.remove(); w.destroy(); setMeasureData(null); }
        };
        break;
      }
      case 'area': {
        const { default: AM } = await import('@arcgis/core/widgets/AreaMeasurement3D');
        const { watch } = await import('@arcgis/core/core/reactiveUtils');
        const w = new AM({ view }); // Headless
        w.viewModel.start();
        setMeasureData({}); // Trigger re-render
        
        const handle = watch(
          () => w.viewModel.measurement,
          (measurement) => setMeasureData(measurement)
        );

        widgetRef.current = {
          viewModel: w.viewModel,
          destroy: () => { handle.remove(); w.destroy(); setMeasureData(null); }
        };
        break;
      }
      case 'volume': {
        const { default: VMA } = await import('@arcgis/core/analysis/VolumeMeasurementAnalysis');
        const { default: SVM } = await import('@arcgis/core/widgets/Sketch/SketchViewModel');
        const { default: GraphicsLayer } = await import('@arcgis/core/layers/GraphicsLayer');
        const { watch } = await import('@arcgis/core/core/reactiveUtils');
        
        const layer = new GraphicsLayer({ listMode: 'hide', elevationInfo: { mode: 'on-the-ground' } });
        view.map.add(layer);

        const analysis = new VMA();
        view.analyses.add(analysis);
        
        const svm = new SVM({
          view,
          layer,
          polygonSymbol: {
            type: "polygon-3d",
            symbolLayers: [{
              type: "fill",
              material: { color: [223, 38, 28, 0.1] },
              outline: { color: [223, 38, 28, 0.8], size: 2 }
            }]
          }
        });

        // Start drawing immediately
        svm.create("polygon");

        // Set initial data to trigger re-render so panel is not empty
        setMeasureData({ cutVolume: 0, fillVolume: 0, netVolume: 0, mode: 'all' });

        // Sync sketch geometry to analysis
        const updateAnalysis = () => {
          if (layer.graphics.length > 0) {
            analysis.geometry = layer.graphics.getItemAt(0).geometry;
          }
        };

        const svmHandle = svm.on(["create", "update", "undo", "redo"], updateAnalysis);

        let isDestroyed = false;
        let watchHandle = null;

        view.whenAnalysisView(analysis).then((analysisView) => {
          if (isDestroyed) return;
          watchHandle = watch(
            () => analysisView.result,
            (result) => {
              setMeasureData(prev => ({
                ...prev,
                cutVolume: result?.cutVolume?.value ?? 0,
                fillVolume: result?.fillVolume?.value ?? 0,
                netVolume: result?.netVolume?.value ?? 0
              }));
            }
          );
        });

        widgetRef.current = { 
          viewModel: analysis, 
          isAnalysis: true,
          destroy: () => { 
            isDestroyed = true;
            if (svmHandle) svmHandle.remove();
            if (watchHandle) watchHandle.remove();
            try { svm.destroy(); } catch(e) {}
            try { view.map.remove(layer); } catch(e) {}
            try { view.analyses.remove(analysis); } catch(e) {}
            setMeasureData(null);
          } 
        };
        break;
      }
      default: break;
    }
  };

  if (!is3D) return null;

  const activeLabel = activeTool ? TOOLS.find(t => t.id === activeTool)?.label + ' Analysis' : '';
  const isPanelOpen = !!activeTool && activeTool !== 'slice';

  const handleNewMeasurement = () => {
    if (widgetRef.current?.isAnalysis) {
      // Re-activate tool to reset analysis (since VMA doesn't have .clear())
      const toolId = activeTool;
      clearAll();
      setTimeout(() => activateTool(toolId), 50);
      return;
    }
    if (widgetRef.current?.viewModel) {
      widgetRef.current.viewModel.clear();
      widgetRef.current.viewModel.start();
    }
  };

  const renderCustomUI = () => {
    if (!activeTool || !widgetRef.current?.viewModel) return null;
    
    const vm = widgetRef.current.viewModel;

    return (
      <div className="measure-panel-wrapper">
        <div className="measure-content-scroll">
          <div className="measure-section">
            <label className="section-label">
              {activeTool === 'volume' ? 'Mode' : 'Unit System'}
            </label>
            <div className="unit-select-wrapper">
              {activeTool === 'volume' ? (
                <select 
                  className="measure-select"
                  value={measureData?.mode || 'all'}
                  onChange={(e) => { setMeasureData(prev => ({...prev, mode: e.target.value})); }}
                >
                  <option value="all">Cut & Fill</option>
                  <option value="cut">Cut Only</option>
                  <option value="fill">Fill Only</option>
                </select>
              ) : (
                <select 
                  className="measure-select"
                  defaultValue="metric"
                  onChange={(e) => { vm.unit = e.target.value; }}
                >
                  <option value="metric">Metric</option>
                  <option value="imperial">Imperial</option>
                  <option value="meters">Meters</option>
                  <option value="kilometers">Kilometers</option>
                  <option value="feet">Feet</option>
                  <option value="miles">Miles</option>
                </select>
              )}
              <ChevronDown className="select-arrow" size={16} />
            </div>
          </div>

          <div className="results-card">
            <span className="section-label">Results</span>
            <div className="results-list">
              
              {activeTool === 'distance' && measureData && (
                <>
                  <div className="result-item">
                    <span className="res-label">Direct</span>
                    <span className="res-value">{measureData.directDistance?.text || '--'}</span>
                  </div>
                  <div className="result-item">
                    <span className="res-label">Horizontal</span>
                    <span className="res-value">{measureData.horizontalDistance?.text || '--'}</span>
                  </div>
                  <div className="result-item">
                    <span className="res-label">Vertical</span>
                    <span className="res-value">{measureData.verticalDistance?.text || '--'}</span>
                  </div>
                </>
              )}

              {activeTool === 'area' && measureData && (
                <>
                  <div className="result-item">
                    <span className="res-label">Area</span>
                    <span className="res-value">{measureData.area?.text || '--'}</span>
                  </div>
                  <div className="result-item">
                    <span className="res-label">Perimeter</span>
                    <span className="res-value">{measureData.perimeterLength?.text || '--'}</span>
                  </div>
                </>
              )}

              {activeTool === 'volume' && (
                <>
                  <div className="result-item">
                    <span className="res-label">CUT VOLUME</span>
                    <span className="res-value">{(measureData?.cutVolume ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} m³</span>
                  </div>
                  <div className="result-item">
                    <span className="res-label">FILL VOLUME</span>
                    <span className="res-value">{(measureData?.fillVolume ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} m³</span>
                  </div>
                  <div className="result-item" style={{ borderTop: '1px solid #e2e8f0', marginTop: '8px', paddingTop: '8px' }}>
                    <span className="res-label" style={{ fontWeight: '700', color: '#1a2f4d' }}>NET VOLUME</span>
                    <span className="res-value" style={{ 
                      fontWeight: '700',
                      color: (measureData?.netVolume ?? 0) < 0 ? '#df261c' : '#10b981' 
                    }}>
                      {(measureData?.netVolume ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} m³
                    </span>
                  </div>
                </>
              )}

              {(!measureData && activeTool !== 'volume') && (
                <div style={{ fontSize: '13px', color: '#64748b', padding: '10px 0' }}>
                  Click on the map to start drawing.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="measure-footer-wrapper">
          <div className="measure-footer-content">
            <button className="new-measure-btn" onClick={handleNewMeasurement}>
              New Measurement
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* ── LEFT SIDE: Analysis Tools Panel ── */}
      <div className="a3d-tools-panel">
        <div className="a3d-tools-header">
          <span>3D Analysis</span>
        </div>
        <div className="a3d-tools-grid">
          {TOOLS.map(({ id, icon, label }) => (
            <button
              key={id}
              className={`a3d-tool-btn ${activeTool === id ? 'active' : ''}`}
              onClick={() => activateTool(id)}
              title={label}
            >
              <div className="a3d-tool-icon">{icon}</div>
              <span className="a3d-tool-label">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── RIGHT SIDE: Standard App SidePanel (Custom UI) ── */}
      <SidePanel
        isOpen={isPanelOpen}
        title={activeLabel}
        onClose={clearAll}
      >
        {renderCustomUI()}
      </SidePanel>
    </>
  );
};

export default Analysis3DPanel;
