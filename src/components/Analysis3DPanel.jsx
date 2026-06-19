import React, { useState, useEffect, useRef } from 'react';
import { Scissors, Ruler, Square, Box, ChevronDown, Eye, Navigation } from 'lucide-react';
import SidePanel from './SidePanel';
import { useLanguage } from '../context/LanguageContext';
import CustomSelect from './CustomSelect';
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
    newMeasurement: "New Measurement",
    viewshed: "Viewshed",
    viewshedAnalysis: "Viewshed Analysis",
    creationMethod: "Creation Method",
    interactivePlacement: "Interactive Placement",
    observerFromCamera: "Observer From Camera",
    interactiveOrientation: "Interactive Orientation",
    alongALine: "Along a Line",
    observerLocation: "Observer Location",
    observerHeight: "Observer Height (m)",
    maxDistance: "Maximum Distance (m)",
    horizontalViewingAngle: "Horizontal Viewing Angle (°)",
    verticalViewingAngle: "Vertical Viewing Angle (°)",
    clearViewshed: "Clear Viewshed"
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
    newMeasurement: "قياس جديد",
    viewshed: "مجال الرؤية",
    viewshedAnalysis: "تحليل مجال الرؤية",
    creationMethod: "طريقة الإنشاء",
    interactivePlacement: "تحديد تفاعلي",
    observerFromCamera: "المراقب من الكاميرا",
    interactiveOrientation: "التوجيه التفاعلي",
    alongALine: "على طول خط",
    observerLocation: "موقع المراقب",
    observerHeight: "ارتفاع المراقب (م)",
    maxDistance: "أقصى مسافة (م)",
    horizontalViewingAngle: "زاوية الرؤية الأفقية (درجة)",
    verticalViewingAngle: "زاوية الرؤية الرأسية (درجة)",
    clearViewshed: "مسح مجال الرؤية"
  }
};

const TOOLS = [
  { id: 'slice',    icon: <Scissors size={18} />, label: 'Slice'    },
  { id: 'distance', icon: <Ruler    size={18} />, label: 'Distance' },
  { id: 'area',     icon: <Square   size={18} />, label: 'Area'     },
  { id: 'volume',   icon: <Box      size={18} />, label: 'Volume'   },
  { id: 'viewshed', icon: <Eye      size={18} />, label: 'Viewshed' },
];

const Analysis3DPanel = ({ view, is3D }) => {
  const { lang } = useLanguage();
  const currentLang = lang === 'AR' ? 'AR' : 'EN';
  
  const [activeTool, setActiveTool] = useState(null);
  const [measureData, setMeasureData] = useState(null);
  const [unitSystem, setUnitSystem] = useState('metric');
  const widgetRef      = useRef(null);
  const widgetMountRef = useRef(null);

  const placementAbortControllerRef = useRef(null);
  const activeViewshedHandlesRef = useRef(null);
  const baseElevationRef = useRef(null);
  const measureDataRef = useRef(null);
  const activeListenersRef = useRef([]);

  useEffect(() => {
    measureDataRef.current = measureData;
  }, [measureData]);

  /* ── Cleanup ─────────────────────────────────────────────────────────── */
  const clearAll = () => {
    if (placementAbortControllerRef.current) {
      placementAbortControllerRef.current.abort();
      placementAbortControllerRef.current = null;
    }
    if (activeViewshedHandlesRef.current) {
      activeViewshedHandlesRef.current.forEach(h => h.remove());
      activeViewshedHandlesRef.current = null;
    }
    if (activeListenersRef.current) {
      activeListenersRef.current.forEach(h => h.remove());
      activeListenersRef.current = [];
    }
    baseElevationRef.current = null;

    if (widgetRef.current) {
      try { widgetRef.current.destroy?.(); } catch (_) {}
      widgetRef.current = null;
    }
    try { view?.analyses?.removeAll(); } catch (_) {}
    if (widgetMountRef.current) widgetMountRef.current.innerHTML = '';
    setActiveTool(null);
  };

  const handleUpdateViewshedParams = (newParams) => {
    setMeasureData(prev => {
      const updated = { ...prev, ...newParams };
      if (widgetRef.current?.viewModel?.viewsheds?.length > 0) {
        const vs = widgetRef.current.viewModel.viewsheds.getItemAt(0);
        if (vs) {
          if ('maxDistance' in newParams) {
            vs.farDistance = Number(newParams.maxDistance) || 0;
          }
          if ('horizontalAngle' in newParams) {
            vs.horizontalFieldOfView = Number(newParams.horizontalAngle) || 0;
          }
          if ('verticalAngle' in newParams) {
            vs.verticalFieldOfView = Number(newParams.verticalAngle) || 0;
          }
          if ('observerHeight' in newParams && vs.observer) {
            if (baseElevationRef.current !== null) {
              const pt = vs.observer.clone();
              pt.z = baseElevationRef.current + (Number(newParams.observerHeight) || 0);
              vs.observer = pt;
            }
          }
        }
      }
      return updated;
    });
  };

  const handleCreationMethodChange = async (method) => {
    setMeasureData(prev => ({ ...prev, creationMethod: method, observerLocation: '' }));

    if (placementAbortControllerRef.current) {
      placementAbortControllerRef.current.abort();
      placementAbortControllerRef.current = null;
    }
    if (activeListenersRef.current) {
      activeListenersRef.current.forEach(h => h.remove());
      activeListenersRef.current = [];
    }

    if (!widgetRef.current?.viewModel) return;
    const analysis = widgetRef.current.viewModel;

    analysis.viewsheds.removeAll();
    baseElevationRef.current = null;

    switch (method) {
      case 'interactive': {
        if (widgetRef.current?.startPlacement) {
          widgetRef.current.startPlacement();
        }
        break;
      }
      case 'camera': {
        const { default: Point } = await import('@arcgis/core/geometry/Point');
        const { default: Viewshed } = await import('@arcgis/core/analysis/Viewshed');

        const cam = view.camera;
        const observerPt = new Point({
          x: cam.position.x,
          y: cam.position.y,
          z: cam.position.z,
          spatialReference: cam.position.spatialReference
        });

        const currentParams = measureDataRef.current || { maxDistance: 1000, horizontalAngle: 90, verticalAngle: 60 };
        const vs = new Viewshed({
          observer: observerPt,
          farDistance: currentParams.maxDistance,
          horizontalFieldOfView: currentParams.horizontalAngle,
          verticalFieldOfView: currentParams.verticalAngle,
          heading: cam.heading,
          tilt: cam.tilt
        });

        analysis.viewsheds.add(vs);
        break;
      }
      case 'orientation': {
        let observerPoint = null;
        const { default: Viewshed } = await import('@arcgis/core/analysis/Viewshed');

        const clickHandle = view.on("click", async (clickEvent) => {
          clickEvent.stopPropagation();
          const mapPoint = clickEvent.mapPoint;
          
          if (!observerPoint) {
            observerPoint = mapPoint;
            
            const vs = new Viewshed({
              observer: mapPoint,
              farDistance: measureDataRef.current.maxDistance,
              horizontalFieldOfView: measureDataRef.current.horizontalAngle,
              verticalFieldOfView: measureDataRef.current.verticalAngle,
              heading: 0,
              tilt: 90
            });
            analysis.viewsheds.add(vs);
            
            const moveHandle = view.on("pointer-move", (moveEvent) => {
              const targetPoint = view.toMap(moveEvent);
              if (targetPoint && vs) {
                const dx = targetPoint.x - observerPoint.x;
                const dy = targetPoint.y - observerPoint.y;
                let heading = (Math.atan2(dx, dy) * 180) / Math.PI;
                if (heading < 0) heading += 360;
                vs.heading = heading;
              }
            });
            
            const secondClickHandle = view.on("click", (secondClickEvent) => {
              secondClickEvent.stopPropagation();
              moveHandle.remove();
              secondClickHandle.remove();
              clickHandle.remove();
              
              activeListenersRef.current = activeListenersRef.current.filter(h => h !== clickHandle);
            });
            
            activeListenersRef.current.push(moveHandle, secondClickHandle);
          }
        });

        activeListenersRef.current.push(clickHandle);
        break;
      }
      case 'line': {
        const { default: SketchViewModel } = await import('@arcgis/core/widgets/Sketch/SketchViewModel');
        const { default: GraphicsLayer } = await import('@arcgis/core/layers/GraphicsLayer');
        const { default: Viewshed } = await import('@arcgis/core/analysis/Viewshed');

        const drawLayer = new GraphicsLayer({ listMode: 'hide' });
        view.map.add(drawLayer);
        
        const svm = new SketchViewModel({
          view,
          layer: drawLayer,
          polylineSymbol: {
            type: "simple-line",
            color: [223, 38, 28, 0.8],
            width: 2
          }
        });
        
        svm.create("polyline");
        
        const svmCreateHandle = svm.on("create", async (event) => {
          if (event.state === "complete") {
            const geom = event.graphic.geometry;
            if (geom && geom.paths && geom.paths[0]) {
              const path = geom.paths[0];
              if (path.length >= 2) {
                const p1 = geom.getPoint(0, 0);
                const p2 = geom.getPoint(0, 1);
                
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                let heading = (Math.atan2(dx, dy) * 180) / Math.PI;
                if (heading < 0) heading += 360;

                const vs = new Viewshed({
                  observer: p1,
                  farDistance: measureDataRef.current.maxDistance,
                  horizontalFieldOfView: measureDataRef.current.horizontalAngle,
                  verticalFieldOfView: measureDataRef.current.verticalAngle,
                  heading: heading,
                  tilt: 90
                });
                
                analysis.viewsheds.add(vs);
              }
            }
            view.map.remove(drawLayer);
            svm.destroy();
          }
        });

        const destroyHandle = {
          remove: () => {
            try { view.map.remove(drawLayer); } catch (_) {}
            try { svm.destroy(); } catch (_) {}
            svmCreateHandle.remove();
          }
        };
        activeListenersRef.current.push(destroyHandle);
        break;
      }
      default:
        break;
    }
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
    setUnitSystem('metric');
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
      case 'viewshed': {
        const { default: ViewshedAnalysis } = await import('@arcgis/core/analysis/ViewshedAnalysis');
        const { watch } = await import('@arcgis/core/core/reactiveUtils');

        const analysis = new ViewshedAnalysis({ viewsheds: [] });
        view.analyses.add(analysis);

        const initialData = {
          creationMethod: 'interactive',
          observerLocation: '',
          observerHeight: 2,
          maxDistance: 1000,
          horizontalAngle: 90,
          verticalAngle: 60
        };
        setMeasureData(initialData);

        const analysisView = await view.whenAnalysisView(analysis);
        analysisView.interactive = true;

        const handle = watch(
          () => analysis.viewsheds.length,
          (length) => {
            if (length > 0) {
              const vs = analysis.viewsheds.getItemAt(0);
              const currentParams = measureDataRef.current || initialData;
              vs.farDistance = currentParams.maxDistance;
              vs.horizontalFieldOfView = currentParams.horizontalAngle;
              vs.verticalFieldOfView = currentParams.verticalAngle;

              if (vs.observer) {
                const initialZ = vs.observer.z || 0;
                baseElevationRef.current = initialZ;
                
                const pt = vs.observer.clone();
                pt.z = initialZ + currentParams.observerHeight;
                vs.observer = pt;

                const coordsText = `${pt.x.toFixed(4)}, ${pt.y.toFixed(4)}`;
                setMeasureData(prev => ({
                  ...prev,
                  observerLocation: coordsText
                }));
              }

              const vsHandles = [
                watch(() => vs.farDistance, (val) => {
                  setMeasureData(prev => ({ ...prev, maxDistance: Math.round(val) }));
                }),
                watch(() => vs.horizontalFieldOfView, (val) => {
                  setMeasureData(prev => ({ ...prev, horizontalAngle: Math.round(val) }));
                }),
                watch(() => vs.verticalFieldOfView, (val) => {
                  setMeasureData(prev => ({ ...prev, verticalAngle: Math.round(val) }));
                }),
                watch(() => vs.observer, (pt) => {
                  if (pt) {
                    const coordsText = `${pt.x.toFixed(4)}, ${pt.y.toFixed(4)}`;
                    setMeasureData(prev => ({ ...prev, observerLocation: coordsText }));
                  }
                })
              ];

              if (activeViewshedHandlesRef.current) {
                activeViewshedHandlesRef.current.forEach(h => h.remove());
              }
              activeViewshedHandlesRef.current = vsHandles;
            } else {
              if (activeViewshedHandlesRef.current) {
                activeViewshedHandlesRef.current.forEach(h => h.remove());
                activeViewshedHandlesRef.current = null;
              }
              baseElevationRef.current = null;
            }
          }
        );

        const startPlacement = async () => {
          if (placementAbortControllerRef.current) {
            placementAbortControllerRef.current.abort();
          }
          placementAbortControllerRef.current = new AbortController();
          
          if (activeViewshedHandlesRef.current) {
            activeViewshedHandlesRef.current.forEach(h => h.remove());
            activeViewshedHandlesRef.current = null;
          }
          baseElevationRef.current = null;
          analysis.viewsheds.removeAll();
          setMeasureData(prev => ({ ...prev, observerLocation: '' }));

          try {
            await analysisView.place({ signal: placementAbortControllerRef.current.signal });
          } catch (err) {
            if (err.name !== 'AbortError') {
              console.warn('Viewshed placement failed:', err);
            }
          }
        };

        startPlacement();

        widgetRef.current = {
          viewModel: analysis,
          analysisView,
          startPlacement,
          destroy: () => {
            handle.remove();
            if (placementAbortControllerRef.current) {
              placementAbortControllerRef.current.abort();
            }
            if (activeViewshedHandlesRef.current) {
              activeViewshedHandlesRef.current.forEach(h => h.remove());
            }
            if (activeListenersRef.current) {
              activeListenersRef.current.forEach(h => h.remove());
              activeListenersRef.current = [];
            }
            try { view.analyses.remove(analysis); } catch (_) {}
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
      const toolId = activeTool;
      clearAll();
      setTimeout(() => activateTool(toolId), 50);
      return;
    }
    if (activeTool === 'viewshed') {
      if (widgetRef.current?.startPlacement) {
        widgetRef.current.startPlacement();
      }
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

    if (activeTool === 'viewshed') {
      const isRTL = currentLang === 'AR';
      return (
        <div className="measure-panel-wrapper">
          <div className="measure-content-scroll" style={{ padding: '0' }}>
            <div className="viewshed-input-wrapper">
              {/* Creation Method */}
              <div className="viewshed-field-group">
                <label>{TRANSLATIONS[currentLang].creationMethod}</label>
                <CustomSelect
                  value={measureData?.creationMethod || 'interactive'}
                  onChange={handleCreationMethodChange}
                  options={[
                    { value: 'interactive', label: TRANSLATIONS[currentLang].interactivePlacement },
                    { value: 'camera', label: TRANSLATIONS[currentLang].observerFromCamera },
                    { value: 'orientation', label: TRANSLATIONS[currentLang].interactiveOrientation },
                    { value: 'line', label: TRANSLATIONS[currentLang].alongALine }
                  ]}
                />
              </div>

              {/* Observer Location */}
              <div className="viewshed-field-group">
                <label>{TRANSLATIONS[currentLang].observerLocation}</label>
                <div className="viewshed-location-container">
                  <input
                    type="text"
                    className="viewshed-input"
                    readOnly
                    placeholder={isRTL ? "انقر على الخريطة لتحديد الموقع..." : "Click on map to place observer..."}
                    value={measureData?.observerLocation || ''}
                  />
                  <button
                    className={`viewshed-location-btn ${!measureData?.observerLocation ? 'active' : ''}`}
                    onClick={() => {
                      if (widgetRef.current?.startPlacement) {
                        widgetRef.current.startPlacement();
                      }
                    }}
                    title={isRTL ? "تحديد الموقع" : "Place Observer"}
                  >
                    <Navigation size={16} />
                  </button>
                </div>
              </div>

              {/* Observer Height & Max Distance */}
              <div className="viewshed-row">
                <div className="viewshed-field-group">
                  <label>{TRANSLATIONS[currentLang].observerHeight}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    className="viewshed-input"
                    value={measureData?.observerHeight ?? 2}
                    onChange={(e) => handleUpdateViewshedParams({ observerHeight: Number(e.target.value) })}
                  />
                </div>
                <div className="viewshed-field-group">
                  <label>{TRANSLATIONS[currentLang].maxDistance}</label>
                  <input
                    type="number"
                    min="1"
                    className="viewshed-input"
                    value={measureData?.maxDistance ?? 1000}
                    onChange={(e) => handleUpdateViewshedParams({ maxDistance: Number(e.target.value) })}
                  />
                </div>
              </div>

              {/* Horizontal & Vertical Viewing Angles */}
              <div className="viewshed-row">
                <div className="viewshed-field-group">
                  <label>{TRANSLATIONS[currentLang].horizontalViewingAngle}</label>
                  <input
                    type="number"
                    min="1"
                    max="360"
                    className="viewshed-input"
                    value={measureData?.horizontalAngle ?? 90}
                    onChange={(e) => handleUpdateViewshedParams({ horizontalAngle: Number(e.target.value) })}
                  />
                </div>
                <div className="viewshed-field-group">
                  <label>{TRANSLATIONS[currentLang].verticalViewingAngle}</label>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    className="viewshed-input"
                    value={measureData?.verticalAngle ?? 60}
                    onChange={(e) => handleUpdateViewshedParams({ verticalAngle: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="measure-footer-wrapper" style={{ padding: '16px 0 0 0' }}>
            <div className="measure-footer-content">
              <button
                className="viewshed-clear-btn"
                onClick={() => {
                  if (widgetRef.current?.viewModel?.viewsheds) {
                    widgetRef.current.viewModel.viewsheds.removeAll();
                  }
                  setMeasureData(prev => ({
                    ...prev,
                    observerLocation: ''
                  }));
                }}
              >
                {TRANSLATIONS[currentLang].clearViewshed}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="measure-panel-wrapper">
        <div className="measure-content-scroll" style={{ padding: '0' }}>
          <div className="viewshed-input-wrapper">
            <div className="viewshed-field-group">
              <label>{activeTool === 'volume' ? TRANSLATIONS[currentLang].mode : TRANSLATIONS[currentLang].unitSystem}</label>
              {activeTool === 'volume' ? (
                <CustomSelect
                  value={measureData?.mode || 'all'}
                  onChange={(val) => { setMeasureData(prev => ({...prev, mode: val})); }}
                  options={[
                    { value: 'all', label: TRANSLATIONS[currentLang].cutFill },
                    { value: 'cut', label: TRANSLATIONS[currentLang].cutOnly },
                    { value: 'fill', label: TRANSLATIONS[currentLang].fillOnly }
                  ]}
                />
              ) : (
                <CustomSelect
                  value={unitSystem}
                  onChange={(val) => {
                    setUnitSystem(val);
                    vm.unit = val;
                  }}
                  options={[
                    { value: 'metric', label: TRANSLATIONS[currentLang].metric },
                    { value: 'imperial', label: TRANSLATIONS[currentLang].imperial },
                    { value: 'meters', label: TRANSLATIONS[currentLang].meters },
                    { value: 'kilometers', label: TRANSLATIONS[currentLang].kilometers },
                    { value: 'feet', label: TRANSLATIONS[currentLang].feet },
                    { value: 'miles', label: TRANSLATIONS[currentLang].miles }
                  ]}
                />
              )}
            </div>

            <div className="results-card">
              <span className="section-label" style={{ fontSize: '11.5px', fontWeight: '700', color: '#1a2f4d', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: "'Outfit', sans-serif" }}>
                {TRANSLATIONS[currentLang].results}
              </span>
              <div className="results-list" style={{ marginTop: '12px' }}>
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
                      <span className="res-label" style={{ fontWeight: '700', color: '#1a2f4d', fontFamily: "'Outfit', sans-serif" }}>{TRANSLATIONS[currentLang].netVolume}</span>
                      <span className="res-value" style={{ 
                        fontWeight: '700',
                        color: (measureData?.netVolume ?? 0) < 0 ? '#df261c' : '#10b981',
                        fontFamily: "'Outfit', sans-serif"
                      }}>
                        {(measureData?.netVolume ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} m³
                      </span>
                    </div>
                  </>
                )}

                {(!measureData && activeTool !== 'volume') && (
                  <div style={{ fontSize: '13px', color: '#64748b', padding: '10px 0', fontFamily: "'Outfit', sans-serif" }}>
                    {TRANSLATIONS[currentLang].emptyState}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="measure-footer-wrapper" style={{ padding: '16px 0 0 0' }}>
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
