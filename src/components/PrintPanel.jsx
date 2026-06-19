import React, { useState, useEffect } from 'react';
import CustomSelect from './CustomSelect';
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
import SpatialReference from "@arcgis/core/geometry/SpatialReference";
import { PDFDocument } from 'pdf-lib';
import './PrintPanel.css';

const TEMPLATES = {
  'A4 Portrait': { width: 210, height: 297, ratio: 210/297 },
  'A4 Landscape': { width: 297, height: 210, ratio: 297/210 },
  'A3 Portrait': { width: 297, height: 420, ratio: 297/420 },
  'A3 Landscape': { width: 420, height: 297, ratio: 420/297 },
};

const PrintPanel = ({ view, t, lang }) => {
  const [activeTab, setActiveTab] = useState('layout');
  
  // Layout Form State
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState('');
  const [showPrintArea, setShowPrintArea] = useState(false);
  const [format, setFormat] = useState('PDF');
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
  const isPrintingRef = React.useRef(isPrinting);
  React.useEffect(() => {
    isPrintingRef.current = isPrinting;
  }, [isPrinting]);

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
    if (isPrintingRef.current) return;

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
          color: [0, 255, 255, 0.25], // semi-transparent cyan fill
          outline: { color: [223, 38, 28, 1], width: 2 } // orange/red outline
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

  const formatDateStr = (date) => {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const handlePrint = async () => {
    if (!view) return;
    setIsPrinting(true);
    const printTitle = title?.trim() || 'Map Print';
    const formattedDate = formatDateStr(new Date());
    const pdfFilename = `${printTitle.replace(/\s+/g, '_')}_${formattedDate}.pdf`;

    try {
      const originalExtent = view.extent ? view.extent.clone() : null;

      // 3D SceneView Printing Flow (via screenshot and PDF conversion)
      if (view.type === "3d") {
        console.log("[Print Tool] 3D view detected, capturing high-resolution screenshot...");
        const screenshot = await view.takeScreenshot({
          format: 'png',
          width: view.width * 2,
          height: view.height * 2
        });

        // Convert screenshot to PDF using pdf-lib
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([view.width, view.height]);
        const pngImage = await pdfDoc.embedPng(screenshot.dataUrl);
        page.drawImage(pngImage, {
          x: 0,
          y: 0,
          width: view.width,
          height: view.height
        });
        const pdfBytes = await pdfDoc.save();
        const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
        const exportUrl = URL.createObjectURL(pdfBlob);

        const generatedItem = {
          id: crypto.randomUUID(),
          name: pdfFilename,
          format: 'PDF',
          url: exportUrl,
          date: new Date().toLocaleString(),
          pages: 1
        };

        setExportsList(prev => [generatedItem, ...prev]);
        setActiveTab('exports');
        logPrintActivity({ title: printTitle, status: 'SUCCESS' });
        return;
      }

      // 2D MapView Printing Flow
      const printUrl = "/arcgis-proxy/server/rest/services/Utilities/PrintingTools/GPServer/Export%20Web%20Map%20Task";
      const pagesToPrint = [];
      
      if (multiPage && printLayer.graphics.length > 0) {
        // Sort graphics by page number if available
        const sortedGraphics = printLayer.graphics.toArray().sort((a, b) => {
          return (a.attributes?.page || 0) - (b.attributes?.page || 0);
        });
        sortedGraphics.forEach(graphic => {
          if (graphic.geometry && graphic.geometry.type === "extent") {
            pagesToPrint.push({
              extent: graphic.geometry,
              pageNumber: graphic.attributes?.page || 1
            });
          }
        });
      } else {
        // Single page print
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
        const targetExtent = printExtent ? (printExtent instanceof Extent ? printExtent : new Extent(printExtent)) : view.extent.clone();
        pagesToPrint.push({
          extent: targetExtent,
          pageNumber: 1
        });
      }

      // Hide print interaction layers so they don't appear in the print output
      const prevPrintLayerVisible = printLayer.visible;
      const prevInteractionLayerVisible = interactionLayer.visible;
      printLayer.visible = false;
      interactionLayer.visible = false;

      const generatedExports = [];
      const pdfUrls = [];

      for (let i = 0; i < pagesToPrint.length; i++) {
        const page = pagesToPrint[i];
        
        try {
          // Move the view to the page extent without animation
          await view.goTo(page.extent, { animate: false });
        } catch (e) {
          console.warn("View goTo interrupted during print", e);
        }
        
        // Wait for a short moment to ensure the view state is updated
        await new Promise(resolve => setTimeout(resolve, 500));

        let layout = template;
        if (!layout || layout === '') {
          layout = 'MAP_ONLY';
        }

        const actualFormat = 'pdf'; // Strictly enforce PDF export on rest print services
        
        const layoutOpts = {
          titleText: pagesToPrint.length > 1 ? `${printTitle} - Page ${page.pageNumber}` : printTitle,
          authorText: author,
          copyrightText: copyright
        };
        
        if (!includeLegend) {
          layoutOpts.legendLayers = [];
        }

        const templateParams = new PrintTemplate({
          format: actualFormat,
          exportOptions: {
            dpi: parseInt(dpi, 10) || 96
          },
          layout: layout,
          layoutOptions: layout !== 'MAP_ONLY' ? layoutOpts : undefined
        });
        
        if (enableScale && scale) {
          templateParams.outScale = parseFloat(scale);
          templateParams.preserveScale = true;
        } else {
          templateParams.preserveScale = false;
        }

        const params = new PrintParameters({
          view: view,
          template: templateParams,
          outSpatialReference: wkid ? new SpatialReference({ wkid: parseInt(wkid, 10) }) : view.spatialReference
        });

        // Call the print service with robust fallbacks
        let result;
        try {
          console.log(`[Print Tool] Attempting print execution with primary service: ${printUrl}`);
          result = await print.execute(printUrl, params);
        } catch (serviceErr) {
          console.warn("[Print Tool] Primary print service failed. Details:", serviceErr);
          const fallbackUrl = "https://utility.arcgisonline.com/arcgis/rest/services/Utilities/PrintingTools/GPServer/Export%20Web%20Map%20Task";
          try {
            console.log(`[Print Tool] Attempting print execution with fallback Esri utility service: ${fallbackUrl}`);
            result = await print.execute(fallbackUrl, params);
          } catch (fallbackErr) {
            console.warn("[Print Tool] Secondary print service failed. Details:", fallbackErr);
            const tertiaryUrl = "https://sampleserver6.arcgisonline.com/arcgis/rest/services/Utilities/PrintingTools/GPServer/Export%20Web%20Map%20Task";
            try {
              console.log(`[Print Tool] Attempting print execution with sampleserver6 service: ${tertiaryUrl}`);
              result = await print.execute(tertiaryUrl, params);
            } catch (finalErr) {
              console.warn("[Print Tool] All remote print servers failed. Falling back to high-resolution client-side capture...", finalErr);
              
              // Local client-side screenshot fallback to guarantee printing succeeds
              const screenshot = await view.takeScreenshot({
                format: 'png',
                width: view.width * 2,
                height: view.height * 2
              });

              const pdfDoc = await PDFDocument.create();
              const page = pdfDoc.addPage([view.width, view.height]);
              const pngImage = await pdfDoc.embedPng(screenshot.dataUrl);
              page.drawImage(pngImage, {
                x: 0, y: 0,
                width: view.width, height: view.height
              });
              const pdfBytes = await pdfDoc.save();
              const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
              const exportUrl = URL.createObjectURL(pdfBlob);

              result = {
                url: exportUrl,
                localCapture: true
              };
            }
          }
        }

        pdfUrls.push(result.url);
      }

      // Compile single or multiple PDF urls into the combined PDF output
      if (pdfUrls.length === 1) {
        generatedExports.push({
          id: crypto.randomUUID(),
          name: pdfFilename,
          format: 'PDF',
          url: pdfUrls[0],
          date: new Date().toLocaleString(),
          pages: 1
        });
      } else if (pdfUrls.length > 1) {
        try {
          const mergedPdf = await PDFDocument.create();
          for (const url of pdfUrls) {
            const response = await fetch(url);
            if (!response.ok) throw new Error("Failed to fetch PDF page from server");
            const pdfBytes = await response.arrayBuffer();
            const pdfDoc = await PDFDocument.load(pdfBytes);
            const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach((p) => mergedPdf.addPage(p));
          }
          
          const mergedPdfBytes = await mergedPdf.save();
          const mergedBlob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
          const mergedUrl = URL.createObjectURL(mergedBlob);
          
          generatedExports.push({
            id: crypto.randomUUID(),
            name: pdfFilename,
            format: 'PDF',
            url: mergedUrl,
            date: new Date().toLocaleString(),
            pages: pdfUrls.length
          });
        } catch (mergeError) {
          console.error("Failed to merge PDFs:", mergeError);
          // Fallback to separate PDFs if merge fails
          pdfUrls.forEach((url, idx) => {
            generatedExports.push({
              id: crypto.randomUUID(),
              name: `${printTitle.replace(/\s+/g, '_')}_${formattedDate}_Page_${idx + 1}.pdf`,
              format: 'PDF',
              url: url,
              date: new Date().toLocaleString(),
              pages: 1
            });
          });
        }
      }

      try {
        // Restore view extent
        if (originalExtent) {
          await view.goTo(originalExtent, { animate: false });
        }
      } catch (e) {
        // Ignore interruption
      }

      // Restore layers
      printLayer.visible = prevPrintLayerVisible;
      interactionLayer.visible = prevInteractionLayerVisible;

      setExportsList(prev => [...generatedExports, ...prev]);
      setActiveTab('exports');
      
      const auditDetails = {
        title,
        template,
        scale,
        format: 'PDF',
        dpi,
        wkid: wkid || view.spatialReference.wkid,
        layers: view.map.layers.filter(l => l.visible).map(l => l.title).toArray(),
        pageCount: pagesToPrint.length
      };

      logPrintActivity({ ...auditDetails, status: 'SUCCESS' });

    } catch (err) {
      console.error("[Print Tool] Print generation failed", err);
      logPrintActivity({ title, status: 'FAILED', error: err.message || err.toString() });
      alert(`Print Generation Failed: ${err.message || 'Unknown error. Please check operational layer layers and connection.'}`);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownload = async (exportItem) => {
    try {
      // If it's a data URL or blob URL, download it directly without a redundant fetch
      if (exportItem.url.startsWith('data:') || exportItem.url.startsWith('blob:')) {
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
    <div className="print-panel-wrapper" dir={lang === 'AR' ? 'rtl' : 'ltr'}>
      {/* Tabs */}
      <div className="print-tabs">
        <button 
          className={`print-tab ${activeTab === 'layout' ? 'active' : ''}`}
          onClick={() => !isPrinting && setActiveTab('layout')}
          disabled={isPrinting}
        >
          {t('printLayoutTab')}
        </button>
        <button 
          className={`print-tab ${activeTab === 'exports' ? 'active' : ''}`}
          onClick={() => !isPrinting && setActiveTab('exports')}
          disabled={isPrinting}
        >
          {t('printExportsTab')} {exportsList.length > 0 && <span className="export-badge">{exportsList.length}</span>}
        </button>
      </div>

      {/* Content */}
      <div className="print-content-scroll">
        {activeTab === 'layout' ? (
          <fieldset disabled={isPrinting} className="print-layout-form" style={{ border: 'none', padding: 0, margin: 0 }}>
            <div className="form-group">
              <label>{t('printTitleLabel')}</label>
              <input 
                type="text" 
                className="tool-input"
                placeholder={t('printTitlePlaceholder')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>{t('printTemplateLabel')}</label>
              <CustomSelect 
                options={[
                  { id: 'A4 Portrait', title: 'A4 Portrait' },
                  { id: 'A4 Landscape', title: 'A4 Landscape' },
                  { id: 'A3 Portrait', title: 'A3 Portrait' },
                  { id: 'A3 Landscape', title: 'A3 Landscape' }
                ]}
                value={template}
                onChange={setTemplate}
                placeholder={t('printSelectTemplate')}
              />
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
                {t('printMultiPage')}
              </label>
            </div>

            {multiPage && (
              <div className="selection-workflow-box">
                <p className="workflow-hint">{t('printWorkflowHint')}</p>
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
                  {isSelectingBoundary ? t('printClickDrag') : t('printDefineBoundary')}
                </button>
              </div>
            )}

            <div className="form-group">
              <label>{t('printFormat')}</label>
              <CustomSelect 
                options={[
                  { id: 'PNG', title: 'PNG' },
                  { id: 'PDF', title: 'PDF' },
                  { id: 'JPG', title: 'JPG' }
                ]}
                value={format}
                onChange={setFormat}
              />
            </div>

            {/* Advanced Section */}
            <div className="advanced-section">
              <button 
                className="advanced-toggle"
                onClick={() => setAdvancedExpanded(!advancedExpanded)}
              >
                <span>{t('printAdvanced')}</span>
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
                      {t('printSetScale')}
                    </label>
                  </div>

                  {enableScale && (
                    <div className="form-group">
                      <label>{t('printScaleLabel')}</label>
                      <div className="scale-input-wrapper">
                        <button className="scale-btn" onClick={() => setScale(s => Math.max(1, s - 1000))}><Minus size={14} /></button>
                        <input 
                          type="number" 
                          className="tool-input text-center"
                          value={scaleInput}
                          onChange={(e) => setScaleInput(e.target.value)}
                          dir="ltr"
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
                          title={t('printRefreshScale')}
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
                      {t('printShowArea')} {showPrintArea && pageGrid.cols * pageGrid.rows > 1 && (
                        <span className="page-count-tag" dir="ltr">
                          ({pageGrid.cols * pageGrid.rows} {t('printPagesCount')} - {pageGrid.cols}x{pageGrid.rows})
                        </span>
                      )}
                    </label>
                  </div>

                  <div className="form-group">
                    <label>{t('printAuthorLabel')}</label>
                    <input 
                      type="text" 
                      className="tool-input"
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>{t('printCopyrightLabel')}</label>
                    <input 
                      type="text" 
                      className="tool-input"
                      value={copyright}
                      onChange={(e) => setCopyright(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>{t('printDpiLabel')}</label>
                    <CustomSelect 
                      options={[
                        { id: '96', title: '96' },
                        { id: '150', title: '150' },
                        { id: '300', title: '300' }
                      ]}
                      value={dpi}
                      onChange={setDpi}
                    />
                  </div>

                  <div className="form-group">
                    <label>{t('printWkidLabel')}</label>
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
                      {t('printIncludeLegend')}
                    </label>
                  </div>

                  <div className="form-checkbox-group">
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={includeNorthArrow}
                        onChange={(e) => setIncludeNorthArrow(e.target.checked)}
                      />
                      {t('printIncludeNorthArrow')}
                    </label>
                  </div>
                </div>
              )}
            </div>

          </fieldset>
        ) : (
          <div className="print-exports-list">
            {exportsList.length === 0 ? (
              <div className="empty-state">
                <div className="empty-card">
                  <div className="empty-icon-wrapper">
                    <FileText size={32} color="#df261c" />
                  </div>
                  <h3 className="empty-title">{t('printNoExportsTitle')}</h3>
                  <p className="empty-desc">{t('printNoExportsDesc')}</p>
                </div>
              </div>
            ) : (
              exportsList.map(item => (
                <div key={item.id} className="export-item">
                  <div className="export-icon">
                    <FileText size={20} color="#df261c" />
                  </div>
                  <div className="export-info">
                    <span className="export-name" title={item.name}>{item.name}</span>
                    <span className="export-date">{item.date}</span>
                  </div>
                  <div className="export-actions">
                    <button className="action-btn" onClick={() => handleDownload(item)} title={t('downloadBtn') || "Download"}>
                      <Download size={16} />
                    </button>
                    <button className="action-btn delete-btn" onClick={() => handleDelete(item.id)} title={t('deleteBtn') || "Delete"}>
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
              disabled={isPrinting}
            >
              {t('cancelBtn')}
            </button>
            <button 
              className="primary-btn" 
              onClick={handlePrint}
              disabled={isPrinting}
            >
              {isPrinting ? (
                <span className="flex-center gap-2">
                  <RefreshCw size={16} className="spinning" />
                  {t('printGenerating')}
                </span>
              ) : (
                t('printPrintBtn')
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrintPanel;
