import React, { useState, useEffect } from 'react';
import { 
  ChevronDown, 
  ChevronUp, 
  FileImage, 
  FileText, 
  Download, 
  Trash2, 
  RefreshCw,
  Minus,
  Plus
} from 'lucide-react';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import SketchViewModel from '@arcgis/core/widgets/Sketch/SketchViewModel';
import Extent from '@arcgis/core/geometry/Extent';
import * as print from "@arcgis/core/rest/print";
import PrintParameters from "@arcgis/core/rest/support/PrintParameters";
import PrintTemplate from "@arcgis/core/rest/support/PrintTemplate";
import PrintViewModel from "@arcgis/core/widgets/Print/PrintViewModel";
import './PrintPanel.css';

const TEMPLATES = {
  'A4 Portrait': { width: 210, height: 297, ratio: 210/297 },
  'A4 Landscape': { width: 297, height: 210, ratio: 297/210 },
  'A3 Portrait': { width: 297, height: 420, ratio: 297/420 },
  'A3 Landscape': { width: 420, height: 297, ratio: 420/297 },
};

const PrintPanel = ({ view }) => {
  const [activeTab, setActiveTab] = useState('layout');
  
  // Layout Form State
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState('');
  const [showPrintArea, setShowPrintArea] = useState(false);
  const [format, setFormat] = useState('PNG');
  const [multiPage, setMultiPage] = useState(false);
  
  // Advanced State
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [enableScale, setEnableScale] = useState(false);
  const [scale, setScale] = useState(9027.977411);
  const [author, setAuthor] = useState('');
  const [copyright, setCopyright] = useState('');
  const [dpi, setDpi] = useState('96');
  const [wkid, setWkid] = useState('');
  const [includeLegend, setIncludeLegend] = useState(false);
  const [includeNorthArrow, setIncludeNorthArrow] = useState(false);
  const [isSelectingBoundary, setIsSelectingBoundary] = useState(false);
  const [scaleInput, setScaleInput] = useState(scale.toString());

  // Exports State
  const [exportsList, setExportsList] = useState([]);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printLayer] = useState(() => new GraphicsLayer({ title: "Print Extent", listMode: "hide" }));
  const [interactionLayer] = useState(() => new GraphicsLayer({ title: "Print Interaction", listMode: "hide" }));
  const [manualExtent, setManualExtent] = useState(null);
  const sketchVMRef = React.useRef(null);
  const boundaryGraphicRef = React.useRef(null);

  // Audit Logger
  const logPrintActivity = (details) => {
    const log = {
      user: "Current User", // In real app, get from auth
      timestamp: new Date().toISOString(),
      ...details
    };
    console.log("📊 PRINT AUDIT LOG:", log);
    // Here we would call: fetch('/api/audit/print', { method: 'POST', body: JSON.stringify(log) });
  };

  const calculateGrid = React.useCallback(() => {
    if (!view || !template || !scale || !multiPage) return { cols: 1, rows: 1 };
    const t = TEMPLATES[template];
    if (!t) return { cols: 1, rows: 1 };

    // Template size in map units
    const mapWidth = (t.width / 1000) * scale;
    const mapHeight = (t.height / 1000) * scale;

    // View size in map units
    const areaWidth = manualExtent ? manualExtent.width : view.extent.width;
    const areaHeight = manualExtent ? manualExtent.height : view.extent.height;

    // If view is larger than template, we need a grid
    const cols = Math.ceil(areaWidth / mapWidth);
    const rows = Math.ceil(areaHeight / mapHeight);

    return { cols: Math.max(1, cols), rows: Math.max(1, rows) };
  }, [view, template, scale, multiPage, manualExtent]);

  const updatePrintExtent = React.useCallback((grid) => {
    // 1. Clear individual pages (always updated)
    printLayer.removeAll();

    if (!showPrintArea || !view || !template || isSelectingBoundary) {
      interactionLayer.removeAll();
      boundaryGraphicRef.current = null;
      if (sketchVMRef.current) sketchVMRef.current.cancel();
      return;
    }

    const t = TEMPLATES[template];
    if (!t) return;

    const mapWidth = (t.width / 1000) * scale;
    const mapHeight = (t.height / 1000) * scale;
    
    const totalWidth = mapWidth * grid.cols;
    const totalHeight = mapHeight * grid.rows;

    let extentToUse;
    
    // If multi-page and we have a manual selection, use it.
    // Otherwise, follow the map center as per the general requirement.
    if (multiPage && manualExtent) {
      extentToUse = manualExtent;
    } else {
      extentToUse = {
        xmin: view.center.x - totalWidth / 2,
        ymin: view.center.y - totalHeight / 2,
        xmax: view.center.x + totalWidth / 2,
        ymax: view.center.y + totalHeight / 2,
        spatialReference: view.spatialReference
      };
    }

    const startX = extentToUse.xmin;
    const startY = extentToUse.ymin;

    // 2. Add individual pages to printLayer
    // Only if template and scale are valid
    if (template && scale) {
      for (let c = 0; c < grid.cols; c++) {
        for (let r = 0; r < grid.rows; r++) {
          const xmin = startX + c * mapWidth;
          const ymin = startY + r * mapHeight;
          const xmax = xmin + mapWidth;
          const ymax = ymin + mapHeight;

          printLayer.add(new Graphic({
            geometry: {
              type: "extent",
              xmin, ymin, xmax, ymax,
              spatialReference: view.spatialReference
            },
            symbol: {
              type: "simple-fill",
              color: [223, 38, 28, 0.02],
              outline: { color: [223, 38, 28, 0.4], width: 1, style: "dash" }
            },
            attributes: { page: c * grid.rows + r + 1 }
          }));
        }
      }
    }

    // 3. Handle boundary/interaction graphic
    // Only re-create if it doesn't exist OR we're NOT currently interacting
    const isInteracting = sketchVMRef.current && (
      sketchVMRef.current.state === "active" || 
      sketchVMRef.current.activeGraphic
    );

    if (!isInteracting) {
      interactionLayer.removeAll();
      const boundaryGraphic = new Graphic({
        geometry: {
          type: "extent",
          xmin: extentToUse.xmin,
          ymin: extentToUse.ymin,
          xmax: extentToUse.xmax,
          ymax: extentToUse.ymax,
          spatialReference: view.spatialReference
        },
        symbol: {
          type: "simple-fill",
          color: [223, 38, 28, 0],
          outline: { color: [223, 38, 28, 1], width: 2 }
        }
      });
      boundaryGraphicRef.current = boundaryGraphic;
      interactionLayer.add(boundaryGraphic);
      
      if (sketchVMRef.current) {
        sketchVMRef.current.update(boundaryGraphic);
      }
    }
  }, [showPrintArea, view, template, scale, manualExtent, printLayer, interactionLayer]);

  const pageGrid = React.useMemo(() => calculateGrid(), [template, scale, multiPage, manualExtent, view?.extent]);

  useEffect(() => {
    if (view && view.map) {
      view.map.add(printLayer);
      view.map.add(interactionLayer);

      const svm = new SketchViewModel({
        view: view,
        layer: interactionLayer,
        updateOnGraphicClick: true,
        defaultUpdateOptions: {
          toggleToolOnClick: false,
          enableRotation: false,
          enableScaling: true,
          preserveAspectRatio: !multiPage
        }
      });

      svm.on("create", (event) => {
        if (event.state === "complete") {
          const graphic = event.graphic;
          setManualExtent(graphic.geometry.extent.clone());
          setIsSelectingBoundary(false);
          setShowPrintArea(true);
        }
      });

      svm.on("update", (event) => {
        if (event.state === "active" || event.state === "complete") {
          const graphic = event.graphics[0];
          if (graphic) {
            setManualExtent(graphic.geometry.extent.clone());
          }
        }
      });

      sketchVMRef.current = svm;
    }
    return () => {
      if (view && view.map) {
        view.map.remove(printLayer);
        view.map.remove(interactionLayer);
      }
    };
  }, [view, printLayer, interactionLayer]);

  useEffect(() => {
    if (sketchVMRef.current) {
      sketchVMRef.current.defaultUpdateOptions = {
        ...sketchVMRef.current.defaultUpdateOptions,
        preserveAspectRatio: !multiPage
      };
    }
  }, [multiPage]);

  useEffect(() => {
    if (view && view.spatialReference) {
      const currentWkid = view.spatialReference.latestWkid || view.spatialReference.wkid;
      if (currentWkid) {
        setWkid(currentWkid.toString());
      }
    }
  }, [view, view?.spatialReference?.wkid, view?.spatialReference?.latestWkid]);

  // 7. Sync Scale Input (Debounced)
  useEffect(() => {
    const num = parseFloat(scaleInput);
    if (!isNaN(num) && num > 0) {
      const timer = setTimeout(() => {
        setScale(num);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [scaleInput]);

  useEffect(() => {
    if (!view) return;
    
    // Watch for extent changes to sync print area - only when stationary to avoid lag
    const handle = view.watch("stationary", (isStationary) => {
      if (isStationary && showPrintArea) {
        updatePrintExtent(calculateGrid());
      }
    });

    return () => handle.remove();
  }, [view, showPrintArea, updatePrintExtent, calculateGrid]);

  useEffect(() => {
    updatePrintExtent(pageGrid);
  }, [showPrintArea, template, scale, multiPage, manualExtent, pageGrid]);

  const handleEnableScaleToggle = (e) => {
    const checked = e.target.checked;
    setEnableScale(checked);
    if (checked && view) {
      setScale(Math.round(view.scale));
    }
  };

  const handlePrint = async () => {
    if (!view) return;
    setIsPrinting(true);

    try {
      // Calculate the actual extent to print based on the current preview
      let printExtent = manualExtent;
      
      if (!printExtent && showPrintArea) {
        const t = TEMPLATES[template];
        if (t && scale) {
          const mapWidth = (t.width / 1000) * scale;
          const mapHeight = (t.height / 1000) * scale;
          const grid = calculateGrid();
          const totalWidth = mapWidth * grid.cols;
          const totalHeight = mapHeight * grid.rows;
          
          printExtent = {
            xmin: view.center.x - totalWidth / 2,
            ymin: view.center.y - totalHeight / 2,
            xmax: view.center.x + totalWidth / 2,
            ymax: view.center.y + totalHeight / 2,
            spatialReference: view.spatialReference
          };
        }
      }

      const targetExtent = printExtent instanceof Extent ? printExtent : new Extent(printExtent || view.extent);

      // 📝 Audit Logging Start
      const auditDetails = {
        title,
        template,
        scale,
        format,
        dpi,
        wkid: wkid || view.spatialReference.wkid,
        layers: view.map.layers.filter(l => l.visible).map(l => l.title).toArray(),
        extent: targetExtent.toJSON(),
        pageCount: multiPage ? (pageGrid.cols * pageGrid.rows) : 1
      };

      // Capture the full viewport including the selection graphics
      const screenshot = await view.takeScreenshot({
        format: format.toLowerCase() === 'jpg' ? 'jpg' : 'png',
        quality: 100
      });

      const newExport = {
        id: crypto.randomUUID(),
        name: `${title || 'Map_Export'}.${format.toLowerCase()}`,
        format: format,
        url: screenshot.dataUrl,
        date: new Date().toLocaleString(),
        pages: multiPage ? (pageGrid.cols * pageGrid.rows) : 1
      };

      setExportsList(prev => [newExport, ...prev]);
      setActiveTab('exports');
      
      logPrintActivity({ ...auditDetails, status: 'SUCCESS' });
    } catch (err) {
      console.error("Print generation failed", err);
      logPrintActivity({ title, status: 'FAILED', error: err.message });
      alert("Failed to generate print");
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownload = async (exportItem) => {
    try {
      // If it's a data URL (from takeScreenshot), we can use it directly
      if (exportItem.url.startsWith('data:')) {
        const link = document.createElement('a');
        link.href = exportItem.url;
        link.download = exportItem.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // For external URLs (from Print Service), try to fetch as blob to force download
      const response = await fetch(exportItem.url);
      if (!response.ok) throw new Error('Network response was not ok');
      
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = exportItem.name;
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.warn("Download failed, falling back to direct link:", err);
      window.open(exportItem.url, '_blank');
    }
  };

  const handleDelete = (id) => {
    setExportsList(prev => prev.filter(e => e.id !== id));
  };

  return (
    <div className="print-panel-wrapper">
      {/* Tabs */}
      <div className="print-tabs">
        <button 
          className={`print-tab ${activeTab === 'layout' ? 'active' : ''}`}
          onClick={() => setActiveTab('layout')}
        >
          Layout
        </button>
        <button 
          className={`print-tab ${activeTab === 'exports' ? 'active' : ''}`}
          onClick={() => setActiveTab('exports')}
        >
          Exports {exportsList.length > 0 && <span className="export-badge">{exportsList.length}</span>}
        </button>
      </div>

      {/* Content */}
      <div className="print-content-scroll">
        {activeTab === 'layout' ? (
          <div className="print-layout-form">
            <div className="form-group">
              <label>Title</label>
              <input 
                type="text" 
                className="tool-input"
                placeholder="Enter Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Template</label>
              <select 
                className="tool-select"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              >
                <option value="" disabled>Select Template</option>
                <option>A4 Portrait</option>
                <option>A4 Landscape</option>
                <option>A3 Portrait</option>
                <option>A3 Landscape</option>
              </select>
            </div>

            <div className="form-checkbox-group">
              <label className="checkbox-label">
                <input 
                  type="checkbox" 
                  checked={multiPage}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setMultiPage(checked);
                    if (!checked) {
                      setManualExtent(null);
                      setShowPrintArea(false);
                    }
                  }}
                />
                Enable Multi-Page Print
              </label>
            </div>

            {multiPage && (
              <div className="selection-workflow-box">
                <p className="workflow-hint">Define the area on map to split into pages</p>
                <button 
                  className={`workflow-btn ${isSelectingBoundary ? 'active' : ''}`}
                  onClick={() => {
                    if (isSelectingBoundary) {
                      sketchVMRef.current.cancel();
                      setIsSelectingBoundary(false);
                    } else {
                      interactionLayer.removeAll();
                      printLayer.removeAll();
                      sketchVMRef.current.create("rectangle");
                      setIsSelectingBoundary(true);
                    }
                  }}
                >
                  {isSelectingBoundary ? 'Click & Drag on Map...' : 'Define Print Area Boundary'}
                </button>
              </div>
            )}

            <div className="form-group">
              <label>File Format</label>
              <select 
                className="tool-select"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                <option>PNG</option>
                <option>PDF</option>
                <option>JPG</option>
              </select>
            </div>

            {/* Advanced Section */}
            <div className="advanced-section">
              <button 
                className="advanced-toggle"
                onClick={() => setAdvancedExpanded(!advancedExpanded)}
              >
                <span>Advanced</span>
                {advancedExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              
              {advancedExpanded && (
                <div className="advanced-content">
                  <div className="form-checkbox-group">
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={enableScale}
                        onChange={handleEnableScaleToggle}
                      />
                      Set Scale
                    </label>
                  </div>

                  {enableScale && (
                    <div className="form-group">
                      <label>Scale</label>
                      <div className="scale-input-wrapper">
                        <button className="scale-btn" onClick={() => setScale(s => Math.max(1, s - 1000))}><Minus size={14} /></button>
                        <input 
                          type="number" 
                          className="tool-input text-center"
                          value={scaleInput}
                          onChange={(e) => setScaleInput(e.target.value)}
                        />
                        <button className="scale-btn" onClick={() => {
                          const next = Math.round(scale + 1000);
                          setScale(next);
                          setScaleInput(next.toString());
                        }}><Plus size={14} /></button>
                        <button 
                          className="scale-btn refresh-btn"
                          onClick={() => { 
                            if(view) {
                              const s = Math.round(view.scale);
                              setScale(s);
                              setScaleInput(s.toString());
                            } 
                          }}
                          title="Refresh to current map scale"
                        >
                          <RefreshCw size={14} />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="form-checkbox-group">
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={showPrintArea}
                        onChange={(e) => setShowPrintArea(e.target.checked)}
                      />
                      Show print area {showPrintArea && pageGrid.cols * pageGrid.rows > 1 && (
                        <span className="page-count-tag">
                          ({pageGrid.cols * pageGrid.rows} Pages - {pageGrid.cols}x{pageGrid.rows})
                        </span>
                      )}
                    </label>
                  </div>

                  <div className="form-group">
                    <label>Author</label>
                    <input 
                      type="text" 
                      className="tool-input"
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Copyright</label>
                    <input 
                      type="text" 
                      className="tool-input"
                      value={copyright}
                      onChange={(e) => setCopyright(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>DPI</label>
                    <select 
                      className="tool-select"
                      value={dpi}
                      onChange={(e) => setDpi(e.target.value)}
                    >
                      <option>96</option>
                      <option>150</option>
                      <option>300</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Output spatial reference (WKID)</label>
                    <input 
                      type="text" 
                      className="tool-input"
                      value={wkid}
                      onChange={(e) => setWkid(e.target.value)}
                      placeholder="e.g. 4326"
                    />
                  </div>

                  <div className="form-checkbox-group">
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={includeLegend}
                        onChange={(e) => setIncludeLegend(e.target.checked)}
                      />
                      Include legend
                    </label>
                  </div>

                  <div className="form-checkbox-group">
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={includeNorthArrow}
                        onChange={(e) => setIncludeNorthArrow(e.target.checked)}
                      />
                      Include North Arrow
                    </label>
                  </div>
                </div>
              )}
            </div>

          </div>
        ) : (
          <div className="print-exports-list">
            {exportsList.length === 0 ? (
              <div className="empty-state">
                <div className="empty-card">
                  <div className="empty-icon-wrapper">
                    <FileImage size={32} />
                  </div>
                  <h3 className="empty-title">No Exports Yet</h3>
                  <p className="empty-desc">Your generated print files will appear here.</p>
                </div>
              </div>
            ) : (
              exportsList.map(item => (
                <div key={item.id} className="export-item">
                  <div className="export-icon">
                    {item.format === 'PDF' ? <FileText size={20} color="#df261c" /> : <FileImage size={20} color="#1e3c72" />}
                  </div>
                  <div className="export-info">
                    <span className="export-name" title={item.name}>{item.name}</span>
                    <span className="export-date">{item.date}</span>
                  </div>
                  <div className="export-actions">
                    <button className="action-btn" onClick={() => handleDownload(item)} title="Download">
                      <Download size={16} />
                    </button>
                    <button className="action-btn delete-btn" onClick={() => handleDelete(item.id)} title="Remove">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {activeTab === 'layout' && (
        <div className="print-footer">
          <div className="footer-actions">
            <button 
              className="secondary-btn"
              onClick={() => {
                setTitle('');
                setTemplate('');
                setShowPrintArea(false);
                setMultiPage(false);
                setManualExtent(null);
                boundaryGraphicRef.current = null;
                if (sketchVMRef.current) sketchVMRef.current.cancel();
              }}
            >
              Cancel
            </button>
            <button 
              className="primary-btn" 
              onClick={handlePrint}
              disabled={isPrinting || !title.trim()}
            >
              {isPrinting ? (
                <span className="flex-center gap-2">
                  <RefreshCw size={16} className="spinning" />
                  Generating...
                </span>
              ) : (
                'Print'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrintPanel;
