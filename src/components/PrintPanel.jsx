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
import './PrintPanel.css';

const PrintPanel = ({ view }) => {
  const [activeTab, setActiveTab] = useState('layout');
  
  // Layout Form State
  const [title, setTitle] = useState('Palm Jumeirah Map');
  const [template, setTemplate] = useState('Nakheel Print Template');
  const [showPrintArea, setShowPrintArea] = useState(false);
  const [format, setFormat] = useState('PNG');
  
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

  // Exports State
  const [exportsList, setExportsList] = useState([]);
  const [isPrinting, setIsPrinting] = useState(false);

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
      // Simulate print service / screenshot generation
      const screenshot = await view.takeScreenshot({
        format: format.toLowerCase() === 'jpg' ? 'jpg' : 'png',
        quality: 100
      });

      const newExport = {
        id: crypto.randomUUID(),
        name: `${title || 'Map_Export'}.${format.toLowerCase()}`,
        format: format,
        url: screenshot.dataUrl,
        date: new Date().toLocaleString()
      };

      setExportsList(prev => [newExport, ...prev]);
      setActiveTab('exports');
    } catch (err) {
      console.error("Print generation failed", err);
      alert("Failed to generate print");
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownload = (exportItem) => {
    const link = document.createElement('a');
    link.href = exportItem.url;
    link.download = exportItem.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
                <option>Nakheel Print Template</option>
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
                  checked={showPrintArea}
                  onChange={(e) => setShowPrintArea(e.target.checked)}
                />
                Show print area
              </label>
            </div>

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
                          value={scale}
                          onChange={(e) => setScale(Number(e.target.value))}
                        />
                        <button className="scale-btn" onClick={() => setScale(s => s + 1000)}><Plus size={14} /></button>
                        <button 
                          className="scale-btn refresh-btn"
                          onClick={() => { if(view) setScale(Math.round(view.scale)); }}
                          title="Refresh to current map scale"
                        >
                          <RefreshCw size={14} />
                        </button>
                      </div>
                    </div>
                  )}

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
          <button 
            className="primary-btn full-width" 
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
      )}
    </div>
  );
};

export default PrintPanel;
