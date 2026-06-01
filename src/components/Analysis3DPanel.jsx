import React, { useState, useEffect, useRef } from 'react';
import { Scissors, Ruler, Square, Box, ChevronDown } from 'lucide-react';
import SidePanel from './SidePanel';
import { useLanguage } from '../context/LanguageContext';
import './Analysis3DPanel.css';

const TRANSLATIONS = {
  EN: {
    title: "3D Analysis",
    slice: "Slice",
    distance: "Distance",
    area: "Area",
    volume: "Volume",
    sliceAnalysis: "Slice Analysis",
    distanceAnalysis: "Distance Analysis",
    areaAnalysis: "Area Analysis",
    volumeAnalysis: "Volume Analysis",
    mode: "Mode",
    unitSystem: "Unit System",
    cutFill: "Cut & Fill",
    cutOnly: "Cut Only",
    fillOnly: "Fill Only",
    metric: "Metric",
    imperial: "Imperial",
    meters: "Meters",
    kilometers: "Kilometers",
    feet: "Feet",
    miles: "Miles",
    results: "Results",
    direct: "Direct",
    horizontal: "Horizontal",
    vertical: "Vertical",
    perimeter: "Perimeter",
    cutVolume: "Cut Volume",
    fillVolume: "Fill Volume",
    netVolume: "Net Volume",
    emptyState: "Click on the map to start drawing.",
    newMeasurement: "New Measurement"
  },
  AR: {
    title: "أدوات التحليل ثلاثي الأبعاد",
    slice: "المقطع",
    distance: "قياس المسافة",
    area: "قياس المساحة",
    volume: "قياس الحجم",
    sliceAnalysis: "تحليل المقطع",
    distanceAnalysis: "تحليل قياس المسافة",
    areaAnalysis: "تحليل قياس المساحة",
    volumeAnalysis: "تحليل قياس الحجم",
    mode: "الوضع",
    unitSystem: "نظام الوحدات",
    cutFill: "حفر وردم",
    cutOnly: "حفر فقط",
    fillOnly: "ردم فقط",
    metric: "متري",
    imperial: "إمبراطوري",
    meters: "أمتار",
    kilometers: "كيلومترات",
    feet: "أقدام",
    miles: "أميال",
    results: "النتائج",
    direct: "المباشر",
    horizontal: "الأفقي",
    vertical: "الرأسي",
    perimeter: "المحيط",
    cutVolume: "حجم الحفر (Cut)",
    fillVolume: "حجم الردم (Fill)",
    netVolume: "صافي الحجم (Net)",
    emptyState: "انقر على الخريطة لبدء الرسم.",
    newMeasurement: "قياس جديد"
  }
};

const TOOLS = [
  { id: 'slice',    icon: <Scissors size={18} />, label: 'Slice'    },
  { id: 'distance', icon: <Ruler    size={18} />, label: 'Distance' },
  { id: 'area',     icon: <Square   size={18} />, label: 'Area'     },
  { id: 'volume',   icon: <Box      size={18} />, label: 'Volume'   },
];

const Analysis3DPanel = ({ view, is3D }) => {
  const { lang } = useLanguage();
  const currentLang = lang === 'AR' ? 'AR' : 'EN';
  
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

  const activeLabel = activeTool ? TRANSLATIONS[currentLang][activeTool + 'Analysis'] : '';
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
              {activeTool === 'volume' ? TRANSLATIONS[currentLang].mode : TRANSLATIONS[currentLang].unitSystem}
            </label>
            <div className="unit-select-wrapper">
              {activeTool === 'volume' ? (
                <select 
                  className="measure-select"
                  value={measureData?.mode || 'all'}
                  onChange={(e) => { setMeasureData(prev => ({...prev, mode: e.target.value})); }}
                >
                  <option value="all">{TRANSLATIONS[currentLang].cutFill}</option>
                  <option value="cut">{TRANSLATIONS[currentLang].cutOnly}</option>
                  <option value="fill">{TRANSLATIONS[currentLang].fillOnly}</option>
                </select>
              ) : (
                <select 
                  className="measure-select"
                  defaultValue="metric"
                  onChange={(e) => { vm.unit = e.target.value; }}
                >
                  <option value="metric">{TRANSLATIONS[currentLang].metric}</option>
                  <option value="imperial">{TRANSLATIONS[currentLang].imperial}</option>
                  <option value="meters">{TRANSLATIONS[currentLang].meters}</option>
                  <option value="kilometers">{TRANSLATIONS[currentLang].kilometers}</option>
                  <option value="feet">{TRANSLATIONS[currentLang].feet}</option>
                  <option value="miles">{TRANSLATIONS[currentLang].miles}</option>
                </select>
              )}
              <ChevronDown className="select-arrow" size={16} />
            </div>
          </div>

          <div className="results-card">
            <span className="section-label">{TRANSLATIONS[currentLang].results}</span>
            <div className="results-list">
              
              {activeTool === 'distance' && measureData && (
                <>
                  <div className="result-item">
                    <span className="res-label">{TRANSLATIONS[currentLang].direct}</span>
                    <span className="res-value">{measureData.directDistance?.text || '--'}</span>
                  </div>
                  <div className="result-item">
                    <span className="res-label">{TRANSLATIONS[currentLang].horizontal}</span>
                    <span className="res-value">{measureData.horizontalDistance?.text || '--'}</span>
                  </div>
                  <div className="result-item">
                    <span className="res-label">{TRANSLATIONS[currentLang].vertical}</span>
                    <span className="res-value">{measureData.verticalDistance?.text || '--'}</span>
                  </div>
                </>
              )}

              {activeTool === 'area' && measureData && (
                <>
                  <div className="result-item">
                    <span className="res-label">{TRANSLATIONS[currentLang].area}</span>
                    <span className="res-value">{measureData.area?.text || '--'}</span>
                  </div>
                  <div className="result-item">
                    <span className="res-label">{TRANSLATIONS[currentLang].perimeter}</span>
                    <span className="res-value">{measureData.perimeterLength?.text || '--'}</span>
                  </div>
                </>
              )}

              {activeTool === 'volume' && (
                <>
                  <div className="result-item">
                    <span className="res-label">{TRANSLATIONS[currentLang].cutVolume}</span>
                    <span className="res-value">{(measureData?.cutVolume ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} m³</span>
                  </div>
                  <div className="result-item">
                    <span className="res-label">{TRANSLATIONS[currentLang].fillVolume}</span>
                    <span className="res-value">{(measureData?.fillVolume ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} m³</span>
                  </div>
                  <div className="result-item" style={{ borderTop: '1px solid #e2e8f0', marginTop: '8px', paddingTop: '8px' }}>
                    <span className="res-label" style={{ fontWeight: '700', color: '#1a2f4d' }}>{TRANSLATIONS[currentLang].netVolume}</span>
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
                  {TRANSLATIONS[currentLang].emptyState}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="measure-footer-wrapper">
          <div className="measure-footer-content">
            <button className="new-measure-btn" onClick={handleNewMeasurement}>
              {TRANSLATIONS[currentLang].newMeasurement}
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
          <span>{TRANSLATIONS[currentLang].title}</span>
        </div>
        <div className="a3d-tools-grid">
          {TOOLS.map(({ id, icon }) => (
            <button
              key={id}
              className={`a3d-tool-btn ${activeTool === id ? 'active' : ''}`}
              onClick={() => activateTool(id)}
              title={TRANSLATIONS[currentLang][id]}
            >
              <div className="a3d-tool-icon">{icon}</div>
              <span className="a3d-tool-label">{TRANSLATIONS[currentLang][id]}</span>
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
